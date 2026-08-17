package acquire

import "testing"

func TestGenerate(t *testing.T) {
	o := Generate(200)

	if len(o.Pods) != 200 {
		t.Fatalf("want 200 pods, got %d", len(o.Pods))
	}
	for _, p := range o.Pods {
		if p.Spec.NodeName == "" {
			t.Errorf("pod %s without nodeName", p.Name)
		}
		if len(p.OwnerReferences) == 0 {
			t.Errorf("pod %s without ownerReference", p.Name)
		}
	}
	if len(o.Deployments) == 0 || len(o.ReplicaSets) == 0 {
		t.Error("missing workloads")
	}
}
