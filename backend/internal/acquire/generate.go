package acquire

import (
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
)

// Generate produces a deterministic synthetic snapshot of about nPods pods,
// spread across nodes and attached to Deployment->ReplicaSet->Pod workloads.
func Generate(nPods int) *Objects {
	const (
		nNodes      = 8
		nNamespaces = 6
	)

	o := &Objects{}

	for i := range nNodes {
		o.Nodes = append(o.Nodes, corev1.Node{
			TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "Node"},
			ObjectMeta: metav1.ObjectMeta{Name: fmt.Sprintf("node-%d", i), UID: types.UID(fmt.Sprintf("gen-node-%d", i))},
		})
	}

	namespaces := make([]string, nNamespaces)
	for i := range namespaces {
		namespaces[i] = fmt.Sprintf("team-%d", i)
		o.Namespaces = append(o.Namespaces, corev1.Namespace{
			TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "Namespace"},
			ObjectMeta: metav1.ObjectMeta{Name: namespaces[i], UID: types.UID("gen-ns-" + namespaces[i])},
		})
	}

	wlByNs := map[string][]string{} // for NetworkPolicies below
	pods := 0
	for w := 0; pods < nPods; w++ {
		ns := namespaces[w%nNamespaces]
		name := fmt.Sprintf("app-%d", w)
		wlByNs[ns] = append(wlByNs[ns], name)
		depUID := fmt.Sprintf("gen-deploy-%d", w)
		rsUID := fmt.Sprintf("gen-rs-%d", w)
		labels := map[string]string{"app": name}

		o.Deployments = append(o.Deployments, appsv1.Deployment{
			TypeMeta:   metav1.TypeMeta{APIVersion: "apps/v1", Kind: "Deployment"},
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns, UID: types.UID(depUID), Labels: labels},
		})
		o.ReplicaSets = append(o.ReplicaSets, appsv1.ReplicaSet{
			TypeMeta: metav1.TypeMeta{APIVersion: "apps/v1", Kind: "ReplicaSet"},
			ObjectMeta: metav1.ObjectMeta{
				Name: name + "-rs", Namespace: ns, UID: types.UID(rsUID), Labels: labels,
				OwnerReferences: ownerRef("apps/v1", "Deployment", name, depUID),
			},
		})
		o.Services = append(o.Services, corev1.Service{
			TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "Service"},
			ObjectMeta: metav1.ObjectMeta{Name: name + "-svc", Namespace: ns, UID: types.UID("gen-svc-" + name)},
			Spec:       corev1.ServiceSpec{Selector: labels},
		})

		stateful := w%4 == 0 // ~1 in 4 workloads mounts storage (one PVC per pod)
		replicas := 3 + w%5  // 3..7 pods per workload
		for r := 0; r < replicas && pods < nPods; r++ {
			podName := fmt.Sprintf("%s-%d", name, r)
			spec := corev1.PodSpec{
				NodeName:   fmt.Sprintf("node-%d", pods%nNodes),
				Containers: []corev1.Container{{Name: "app", Image: "ghcr.io/acme/app:1.0", Resources: syntheticLimits(pods)}},
			}
			if stateful {
				pvcName := "data-" + podName
				o.PersistentVolumeClaims = append(o.PersistentVolumeClaims, corev1.PersistentVolumeClaim{
					TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "PersistentVolumeClaim"},
					ObjectMeta: metav1.ObjectMeta{Name: pvcName, Namespace: ns, UID: types.UID("gen-pvc-" + podName)},
				})
				spec.Volumes = []corev1.Volume{{
					Name: "data",
					VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: pvcName},
					},
				}}
			}
			o.Pods = append(o.Pods, corev1.Pod{
				TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "Pod"},
				ObjectMeta: metav1.ObjectMeta{
					Name: podName, Namespace: ns,
					UID:             types.UID(fmt.Sprintf("gen-pod-%d-%d", w, r)),
					Labels:          labels,
					OwnerReferences: ownerRef("apps/v1", "ReplicaSet", name+"-rs", rsUID),
				},
				Spec:   spec,
				Status: syntheticStatus(pods),
			})
			o.PodMetrics = append(o.PodMetrics, syntheticMetrics(podName, ns, pods))
			pods++
		}
	}

	// one NetworkPolicy per namespace with ≥2 workloads: 2nd -> 1st ingress
	for ns, wls := range wlByNs {
		if len(wls) < 2 {
			continue
		}
		o.NetworkPolicies = append(o.NetworkPolicies, networkingv1.NetworkPolicy{
			TypeMeta: metav1.TypeMeta{APIVersion: "networking.k8s.io/v1", Kind: "NetworkPolicy"},
			ObjectMeta: metav1.ObjectMeta{
				Name: "allow-" + wls[0], Namespace: ns, UID: types.UID("gen-np-" + wls[0]),
			},
			Spec: networkingv1.NetworkPolicySpec{
				PodSelector: metav1.LabelSelector{MatchLabels: map[string]string{"app": wls[0]}},
				Ingress: []networkingv1.NetworkPolicyIngressRule{{
					From: []networkingv1.NetworkPolicyPeer{{
						PodSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": wls[1]}},
					}},
				}},
			},
		})
	}

	return o
}

// syntheticStatus: ~1 in 13 error, ~1 in 7 pending, rest healthy.
func syntheticStatus(i int) corev1.PodStatus {
	switch {
	case i%13 == 0:
		return corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{{
				State: corev1.ContainerState{
					Waiting: &corev1.ContainerStateWaiting{Reason: "CrashLoopBackOff"},
				},
			}},
		}
	case i%7 == 0:
		return corev1.PodStatus{Phase: corev1.PodPending}
	default:
		return corev1.PodStatus{
			Phase:      corev1.PodRunning,
			Conditions: []corev1.PodCondition{{Type: corev1.PodReady, Status: corev1.ConditionTrue}},
		}
	}
}

// syntheticLimits: ~4 in 5 pods get a fixed 600m/512Mi limit (so cpu%/mem%
// search has something to compare against); the rest are left unbounded.
func syntheticLimits(i int) corev1.ResourceRequirements {
	if i%5 == 0 {
		return corev1.ResourceRequirements{}
	}
	return corev1.ResourceRequirements{
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    *resource.NewMilliQuantity(600, resource.DecimalSI),
			corev1.ResourceMemory: *resource.NewQuantity(512*1024*1024, resource.BinarySI),
		},
	}
}

// syntheticMetrics: deterministic CPU/memory per pod (no metrics-server needed).
func syntheticMetrics(name, ns string, i int) metricsv1beta1.PodMetrics {
	cpu := 20 + (i*37)%480 // 20..500 millicores
	mem := 32 + (i*53)%480 // 32..512 Mi
	return metricsv1beta1.PodMetrics{
		TypeMeta:   metav1.TypeMeta{APIVersion: "metrics.k8s.io/v1beta1", Kind: "PodMetrics"},
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns},
		Containers: []metricsv1beta1.ContainerMetrics{{
			Name: "app",
			Usage: corev1.ResourceList{
				corev1.ResourceCPU:    *resource.NewMilliQuantity(int64(cpu), resource.DecimalSI),
				corev1.ResourceMemory: *resource.NewQuantity(int64(mem)*1024*1024, resource.BinarySI),
			},
		}},
	}
}

func ownerRef(apiVersion, kind, name, uid string) []metav1.OwnerReference {
	controller := true
	return []metav1.OwnerReference{{
		APIVersion: apiVersion,
		Kind:       kind,
		Name:       name,
		UID:        types.UID(uid),
		Controller: &controller,
	}}
}
