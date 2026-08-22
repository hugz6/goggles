package domain

// Builds "describe" sections (title + key/value rows) per kind, from raw
// Kubernetes objects. Rendered as-is by the frontend.

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const dash = "-"

func row(k, v string) [2]string { return [2]string{k, v} }

func orDash(s string) string {
	if s == "" {
		return dash
	}
	return s
}

func boolStr(b bool) string {
	if b {
		return "yes"
	}
	return "no"
}

func i32(p *int32) string {
	if p == nil {
		return dash
	}
	return strconv.Itoa(int(*p))
}

func strPtr(p *string) string {
	if p == nil || *p == "" {
		return dash
	}
	return *p
}

// ageSince: compact duration since t, e.g. "3d4h", like kubectl's AGE.
func ageSince(t time.Time) string {
	if t.IsZero() {
		return dash
	}
	d := max(time.Since(t), 0)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh%dm", int(d.Hours()), int(d.Minutes())%60)
	default:
		days := int(d.Hours()) / 24
		return fmt.Sprintf("%dd%dh", days, int(d.Hours())%24)
	}
}

func mapRows(m map[string]string) [][2]string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	rows := make([][2]string, 0, len(keys))
	for _, k := range keys {
		rows = append(rows, row(k, m[k]))
	}
	return rows
}

// selectorStr flattens a LabelSelector into "k=v,k2=v2" (sorted matchLabels).
func selectorStr(sel *metav1.LabelSelector) string {
	if sel == nil || len(sel.MatchLabels) == 0 {
		return dash
	}
	keys := make([]string, 0, len(sel.MatchLabels))
	for k := range sel.MatchLabels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+sel.MatchLabels[k])
	}
	return strings.Join(parts, ",")
}

// ofLimit formats "" or " (N% of limit)"; empty when the limit is undefined.
func ofLimit(usage, limit int64) string {
	if limit <= 0 {
		return ""
	}
	return fmt.Sprintf(" (%d%% of limit)", usage*100/limit)
}

// reqLim formats a container resource's "request / limit" ("-" when absent).
func reqLim(name corev1.ResourceName, r corev1.ResourceRequirements) string {
	req, hasReq := r.Requests[name]
	lim, hasLim := r.Limits[name]
	switch {
	case hasReq && hasLim:
		return req.String() + " / " + lim.String()
	case hasReq:
		return req.String() + " / " + dash
	case hasLim:
		return dash + " / " + lim.String()
	default:
		return dash
	}
}

func portsStr(ports []corev1.ContainerPort) string {
	if len(ports) == 0 {
		return dash
	}
	parts := make([]string, 0, len(ports))
	for _, p := range ports {
		s := fmt.Sprintf("%d/%s", p.ContainerPort, p.Protocol)
		if p.Name != "" {
			s = p.Name + ":" + s
		}
		parts = append(parts, s)
	}
	return strings.Join(parts, ", ")
}

func containerState(cs corev1.ContainerStatus) string {
	switch {
	case cs.State.Running != nil:
		return "running"
	case cs.State.Waiting != nil:
		return "waiting: " + orDash(cs.State.Waiting.Reason)
	case cs.State.Terminated != nil:
		t := cs.State.Terminated
		return fmt.Sprintf("terminated: %s (exit %d)", orDash(t.Reason), t.ExitCode)
	default:
		return "unknown"
	}
}

func metaSection(m metav1.ObjectMeta, extra ...[2]string) DetailSection {
	rows := [][2]string{row("name", m.Name)}
	if m.Namespace != "" {
		rows = append(rows, row("namespace", m.Namespace))
	}
	rows = append(rows, row("uid", string(m.UID)))
	if t := m.CreationTimestamp.Time; !t.IsZero() {
		rows = append(rows,
			row("created", t.UTC().Format("2006-01-02 15:04:05 UTC")),
			row("age", ageSince(t)),
		)
	}
	rows = append(rows, extra...)
	return DetailSection{Title: "metadata", Rows: rows}
}

// Bulky annotation (a YAML copy) hidden from the describe view.
const lastAppliedKey = "kubectl.kubernetes.io/last-applied-configuration"

// withLabelsAnnos appends labels/annotations sections when present.
func withLabelsAnnos(secs []DetailSection, m metav1.ObjectMeta) []DetailSection {
	if len(m.Labels) > 0 {
		secs = append(secs, DetailSection{Title: "labels", Rows: mapRows(m.Labels), AccentKey: true})
	}
	annos := make(map[string]string, len(m.Annotations))
	for k, v := range m.Annotations {
		if k == lastAppliedKey {
			continue
		}
		if len(v) > 200 {
			v = v[:200] + "…"
		}
		annos[k] = v
	}
	if len(annos) > 0 {
		secs = append(secs, DetailSection{Title: "annotations", Rows: mapRows(annos), AccentKey: true})
	}
	return secs
}

func templateSection(t corev1.PodTemplateSpec) DetailSection {
	rows := make([][2]string, 0, len(t.Spec.Containers))
	for _, c := range t.Spec.Containers {
		rows = append(rows, row(c.Name, c.Image))
	}
	return DetailSection{Title: "containers", Rows: rows, AccentKey: true}
}

func podDetail(p *corev1.Pod, usage map[string]podUsage) []DetailSection {
	secs := []DetailSection{
		metaSection(p.ObjectMeta,
			row("node", orDash(p.Spec.NodeName)),
			row("serviceAccount", orDash(p.Spec.ServiceAccountName)),
			row("QoS", orDash(string(p.Status.QOSClass))),
		),
	}

	var restarts int32
	for _, cs := range p.Status.ContainerStatuses {
		restarts += cs.RestartCount
	}
	status := [][2]string{
		row("phase", orDash(string(p.Status.Phase))),
		row("health", string(podHealth(p))),
		row("podIP", orDash(p.Status.PodIP)),
		row("hostIP", orDash(p.Status.HostIP)),
		row("restarts", strconv.Itoa(int(restarts))),
	}
	if p.Status.StartTime != nil {
		status = append(status, row("started", ageSince(p.Status.StartTime.Time)+" ago"))
	}
	secs = append(secs, DetailSection{Title: "status", Rows: status})

	if len(p.Status.Conditions) > 0 {
		rows := make([][2]string, 0, len(p.Status.Conditions))
		for _, c := range p.Status.Conditions {
			rows = append(rows, row(string(c.Type), string(c.Status)))
		}
		secs = append(secs, DetailSection{Title: "conditions", Rows: rows, AccentKey: true})
	}

	if u, ok := usage[p.Namespace+"/"+p.Name]; ok && (u.cpuMillis > 0 || u.memBytes > 0) {
		cpuLimit, memLimit := podLimits(p)
		secs = append(secs, DetailSection{Title: "metrics", Rows: [][2]string{
			row("cpu", fmt.Sprintf("%d m%s", u.cpuMillis, ofLimit(u.cpuMillis, cpuLimit))),
			row("memory", fmt.Sprintf("%d Mi%s", u.memBytes/(1024*1024), ofLimit(u.memBytes, memLimit))),
		}})
	}

	statusByName := make(map[string]corev1.ContainerStatus, len(p.Status.ContainerStatuses))
	for _, cs := range p.Status.ContainerStatuses {
		statusByName[cs.Name] = cs
	}
	for _, c := range p.Spec.Containers {
		rows := [][2]string{row("image", c.Image)}
		if cs, ok := statusByName[c.Name]; ok {
			rows = append(rows,
				row("ready", boolStr(cs.Ready)),
				row("restarts", strconv.Itoa(int(cs.RestartCount))),
				row("state", containerState(cs)),
			)
		}
		rows = append(rows,
			row("cpu req/lim", reqLim(corev1.ResourceCPU, c.Resources)),
			row("mem req/lim", reqLim(corev1.ResourceMemory, c.Resources)),
			row("ports", portsStr(c.Ports)),
		)
		secs = append(secs, DetailSection{Title: "container · " + c.Name, Rows: rows})
	}

	return withLabelsAnnos(secs, p.ObjectMeta)
}

func deploymentDetail(d *appsv1.Deployment) []DetailSection {
	secs := []DetailSection{
		metaSection(d.ObjectMeta, row("strategy", string(d.Spec.Strategy.Type))),
		{Title: "replicas", Rows: [][2]string{
			row("desired", i32(d.Spec.Replicas)),
			row("ready", strconv.Itoa(int(d.Status.ReadyReplicas))),
			row("updated", strconv.Itoa(int(d.Status.UpdatedReplicas))),
			row("available", strconv.Itoa(int(d.Status.AvailableReplicas))),
		}},
		{Title: "selector", Rows: [][2]string{row("match", selectorStr(d.Spec.Selector))}},
		templateSection(d.Spec.Template),
	}
	return withLabelsAnnos(secs, d.ObjectMeta)
}

func replicaSetDetail(rs *appsv1.ReplicaSet) []DetailSection {
	secs := []DetailSection{
		metaSection(rs.ObjectMeta),
		{Title: "replicas", Rows: [][2]string{
			row("desired", i32(rs.Spec.Replicas)),
			row("current", strconv.Itoa(int(rs.Status.Replicas))),
			row("ready", strconv.Itoa(int(rs.Status.ReadyReplicas))),
			row("available", strconv.Itoa(int(rs.Status.AvailableReplicas))),
		}},
		{Title: "selector", Rows: [][2]string{row("match", selectorStr(rs.Spec.Selector))}},
		templateSection(rs.Spec.Template),
	}
	return withLabelsAnnos(secs, rs.ObjectMeta)
}

func statefulSetDetail(s *appsv1.StatefulSet) []DetailSection {
	secs := []DetailSection{
		metaSection(s.ObjectMeta, row("serviceName", orDash(s.Spec.ServiceName))),
		{Title: "replicas", Rows: [][2]string{
			row("desired", i32(s.Spec.Replicas)),
			row("ready", strconv.Itoa(int(s.Status.ReadyReplicas))),
			row("current", strconv.Itoa(int(s.Status.CurrentReplicas))),
			row("updated", strconv.Itoa(int(s.Status.UpdatedReplicas))),
		}},
		templateSection(s.Spec.Template),
	}
	return withLabelsAnnos(secs, s.ObjectMeta)
}

func daemonSetDetail(ds *appsv1.DaemonSet) []DetailSection {
	secs := []DetailSection{
		metaSection(ds.ObjectMeta),
		{Title: "status", Rows: [][2]string{
			row("desired", strconv.Itoa(int(ds.Status.DesiredNumberScheduled))),
			row("current", strconv.Itoa(int(ds.Status.CurrentNumberScheduled))),
			row("ready", strconv.Itoa(int(ds.Status.NumberReady))),
			row("available", strconv.Itoa(int(ds.Status.NumberAvailable))),
			row("updated", strconv.Itoa(int(ds.Status.UpdatedNumberScheduled))),
		}},
		templateSection(ds.Spec.Template),
	}
	return withLabelsAnnos(secs, ds.ObjectMeta)
}

func jobDetail(j *batchv1.Job) []DetailSection {
	status := [][2]string{
		row("completions", i32(j.Spec.Completions)),
		row("parallelism", i32(j.Spec.Parallelism)),
		row("succeeded", strconv.Itoa(int(j.Status.Succeeded))),
		row("failed", strconv.Itoa(int(j.Status.Failed))),
		row("active", strconv.Itoa(int(j.Status.Active))),
	}
	if j.Status.StartTime != nil {
		status = append(status, row("started", ageSince(j.Status.StartTime.Time)+" ago"))
		if j.Status.CompletionTime != nil {
			status = append(status, row("duration", j.Status.CompletionTime.Sub(j.Status.StartTime.Time).Round(time.Second).String()))
		}
	}
	secs := []DetailSection{
		metaSection(j.ObjectMeta),
		{Title: "status", Rows: status},
		templateSection(j.Spec.Template),
	}
	return withLabelsAnnos(secs, j.ObjectMeta)
}

func serviceDetail(s *corev1.Service) []DetailSection {
	extra := [][2]string{
		row("type", string(s.Spec.Type)),
		row("clusterIP", orDash(s.Spec.ClusterIP)),
	}
	if len(s.Spec.ExternalIPs) > 0 {
		extra = append(extra, row("externalIPs", strings.Join(s.Spec.ExternalIPs, ", ")))
	}
	secs := []DetailSection{metaSection(s.ObjectMeta, extra...)}

	if len(s.Spec.Ports) > 0 {
		rows := make([][2]string, 0, len(s.Spec.Ports))
		for _, p := range s.Spec.Ports {
			target := p.TargetPort.String()
			if target == "" || target == "0" {
				target = strconv.Itoa(int(p.Port)) // targetPort defaults to port
			}
			v := fmt.Sprintf("%d -> %s/%s", p.Port, target, p.Protocol)
			if p.NodePort != 0 {
				v += fmt.Sprintf(" (nodePort %d)", p.NodePort)
			}
			name := p.Name
			if name == "" {
				name = "port"
			}
			rows = append(rows, row(name, v))
		}
		secs = append(secs, DetailSection{Title: "ports", Rows: rows, AccentKey: true})
	}
	if len(s.Spec.Selector) > 0 {
		secs = append(secs, DetailSection{Title: "selector", Rows: mapRows(s.Spec.Selector), AccentKey: true})
	}
	return withLabelsAnnos(secs, s.ObjectMeta)
}

func ingressDetail(ing *networkingv1.Ingress) []DetailSection {
	secs := []DetailSection{metaSection(ing.ObjectMeta, row("class", strPtr(ing.Spec.IngressClassName)))}

	var rules [][2]string
	for _, r := range ing.Spec.Rules {
		host := r.Host
		if host == "" {
			host = "*"
		}
		if r.HTTP == nil {
			continue
		}
		for _, path := range r.HTTP.Paths {
			backend := dash
			if svc := path.Backend.Service; svc != nil {
				backend = svc.Name
				if svc.Port.Number != 0 {
					backend += fmt.Sprintf(":%d", svc.Port.Number)
				} else if svc.Port.Name != "" {
					backend += ":" + svc.Port.Name
				}
			}
			rules = append(rules, row(host+path.Path, backend))
		}
	}
	if len(rules) > 0 {
		secs = append(secs, DetailSection{Title: "rules", Rows: rules, AccentKey: true})
	}
	return withLabelsAnnos(secs, ing.ObjectMeta)
}

func pvcDetail(pvc *corev1.PersistentVolumeClaim) []DetailSection {
	capacity := dash
	if q, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
		capacity = q.String()
	} else if q, ok := pvc.Spec.Resources.Requests[corev1.ResourceStorage]; ok {
		capacity = q.String()
	}
	modes := make([]string, 0, len(pvc.Spec.AccessModes))
	for _, m := range pvc.Spec.AccessModes {
		modes = append(modes, string(m))
	}
	accessModes := dash
	if len(modes) > 0 {
		accessModes = strings.Join(modes, ", ")
	}
	volumeMode := dash
	if pvc.Spec.VolumeMode != nil {
		volumeMode = string(*pvc.Spec.VolumeMode)
	}
	secs := []DetailSection{
		metaSection(pvc.ObjectMeta,
			row("phase", string(pvc.Status.Phase)),
			row("storageClass", strPtr(pvc.Spec.StorageClassName)),
			row("volume", orDash(pvc.Spec.VolumeName)),
		),
		{Title: "storage", Rows: [][2]string{
			row("capacity", capacity),
			row("accessModes", accessModes),
			row("volumeMode", volumeMode),
		}},
	}
	return withLabelsAnnos(secs, pvc.ObjectMeta)
}

// genericDetail: minimal sections for a custom resource whose spec is unknown.
func genericDetail(m metav1.ObjectMeta) []DetailSection {
	return withLabelsAnnos([]DetailSection{metaSection(m)}, m)
}
