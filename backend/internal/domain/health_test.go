package domain

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
)

func TestPodHealth(t *testing.T) {
	ready := corev1.PodCondition{Type: corev1.PodReady, Status: corev1.ConditionTrue}
	notReady := corev1.PodCondition{Type: corev1.PodReady, Status: corev1.ConditionFalse}
	crash := corev1.ContainerStatus{State: corev1.ContainerState{
		Waiting: &corev1.ContainerStateWaiting{Reason: "CrashLoopBackOff"},
	}}

	cases := []struct {
		name string
		pod  corev1.Pod
		want Health
	}{
		{"running and ready", pod(corev1.PodRunning, []corev1.PodCondition{ready}, nil), HealthOK},
		{"failed", pod(corev1.PodFailed, nil, nil), HealthError},
		{"crashloop", pod(corev1.PodRunning, []corev1.PodCondition{ready}, []corev1.ContainerStatus{crash}), HealthError},
		{"pending", pod(corev1.PodPending, nil, nil), HealthWarning},
		{"running not ready", pod(corev1.PodRunning, []corev1.PodCondition{notReady}, nil), HealthWarning},
		{"frequent restarts", pod(corev1.PodRunning, []corev1.PodCondition{ready}, []corev1.ContainerStatus{{RestartCount: 9}}), HealthWarning},
		{"succeeded", pod(corev1.PodSucceeded, nil, nil), HealthOK},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := podHealth(&c.pod); got != c.want {
				t.Errorf("podHealth = %q, want %q", got, c.want)
			}
		})
	}
}

func pod(phase corev1.PodPhase, conds []corev1.PodCondition, cs []corev1.ContainerStatus) corev1.Pod {
	return corev1.Pod{Status: corev1.PodStatus{Phase: phase, Conditions: conds, ContainerStatuses: cs}}
}
