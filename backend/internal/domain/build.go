package domain

import (
	corev1 "k8s.io/api/core/v1"

	"g5s/internal/acquire"
)

// BuildGraph turns raw Kubernetes objects into nodes, then edges.
func BuildGraph(o *acquire.Objects) *Graph {
	g := &Graph{}
	usage := metricsByPod(o) // empty without metrics-server

	for i := range o.Deployments {
		n := baseNode(o.Deployments[i].ObjectMeta, KindDeployment)
		n.Detail = deploymentDetail(&o.Deployments[i])
		g.Nodes = append(g.Nodes, n)
	}
	for i := range o.ReplicaSets {
		n := baseNode(o.ReplicaSets[i].ObjectMeta, KindReplicaSet)
		n.Detail = replicaSetDetail(&o.ReplicaSets[i])
		g.Nodes = append(g.Nodes, n)
	}
	for i := range o.StatefulSets {
		n := baseNode(o.StatefulSets[i].ObjectMeta, KindStatefulSet)
		n.Detail = statefulSetDetail(&o.StatefulSets[i])
		g.Nodes = append(g.Nodes, n)
	}
	for i := range o.DaemonSets {
		n := baseNode(o.DaemonSets[i].ObjectMeta, KindDaemonSet)
		n.Detail = daemonSetDetail(&o.DaemonSets[i])
		g.Nodes = append(g.Nodes, n)
	}
	for i := range o.Jobs {
		n := baseNode(o.Jobs[i].ObjectMeta, KindJob)
		n.Detail = jobDetail(&o.Jobs[i])
		g.Nodes = append(g.Nodes, n)
	}
	for i := range o.Pods {
		g.Nodes = append(g.Nodes, podNode(&o.Pods[i], usage))
	}
	for i := range o.Services {
		n := baseNode(o.Services[i].ObjectMeta, KindService)
		n.Detail = serviceDetail(&o.Services[i])
		g.Nodes = append(g.Nodes, n)
	}
	for i := range o.Ingresses {
		n := baseNode(o.Ingresses[i].ObjectMeta, KindIngress)
		n.Detail = ingressDetail(&o.Ingresses[i])
		g.Nodes = append(g.Nodes, n)
	}
	for i := range o.PersistentVolumeClaims {
		n := baseNode(o.PersistentVolumeClaims[i].ObjectMeta, KindPVC)
		n.Detail = pvcDetail(&o.PersistentVolumeClaims[i])
		g.Nodes = append(g.Nodes, n)
	}
	for i := range o.CustomResources {
		n := baseNode(o.CustomResources[i].ObjectMeta, NodeKind(o.CustomResources[i].Kind))
		n.Custom = true
		n.Detail = genericDetail(o.CustomResources[i].ObjectMeta)
		g.Nodes = append(g.Nodes, n)
	}

	known := nodeIDs(g.Nodes)
	g.Edges = ownerEdges(o, known)
	extra := append(networkEdges(o), mountsEdges(o)...)
	for _, e := range extra {
		if _, okFrom := known[e.From]; okFrom {
			if _, okTo := known[e.To]; okTo {
				g.Edges = append(g.Edges, e)
			}
		}
	}
	return g
}

func podNode(p *corev1.Pod, usage map[string]podUsage) Node {
	n := baseNode(p.ObjectMeta, KindPod)
	n.NodeName = p.Spec.NodeName
	n.Health = podHealth(p)
	for _, c := range p.Spec.Containers {
		n.Containers = append(n.Containers, Container{Name: c.Name, Image: c.Image})
	}
	if u, ok := usage[p.Namespace+"/"+p.Name]; ok {
		n.CPUMillis = u.cpuMillis
		n.MemBytes = u.memBytes
	}
	n.CPULimitMillis, n.MemLimitBytes = podLimits(p)
	n.Detail = podDetail(p, usage)
	return n
}

// podLimits sums container CPU/memory limits. Either total is 0 if any
// container omits that limit: an unbounded container makes the pod's total
// undefined, not just the sum of what's declared.
func podLimits(p *corev1.Pod) (cpuMillis, memBytes int64) {
	cpuBounded, memBounded := true, true
	for _, c := range p.Spec.Containers {
		if cpu, ok := c.Resources.Limits[corev1.ResourceCPU]; ok {
			cpuMillis += cpu.MilliValue()
		} else {
			cpuBounded = false
		}
		if mem, ok := c.Resources.Limits[corev1.ResourceMemory]; ok {
			memBytes += mem.Value()
		} else {
			memBounded = false
		}
	}
	if !cpuBounded {
		cpuMillis = 0
	}
	if !memBounded {
		memBytes = 0
	}
	return cpuMillis, memBytes
}

func nodeIDs(nodes []Node) map[string]struct{} {
	ids := make(map[string]struct{}, len(nodes))
	for _, n := range nodes {
		ids[n.ID] = struct{}{}
	}
	return ids
}
