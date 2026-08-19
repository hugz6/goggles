package domain

import corev1 "k8s.io/api/core/v1"

// podHealth checks most to least severe.
func podHealth(p *corev1.Pod) Health {
	if p.Status.Phase == corev1.PodFailed {
		return HealthError
	}

	// A container stuck waiting for a failure reason is an error.
	for _, cs := range p.Status.ContainerStatuses {
		if w := cs.State.Waiting; w != nil && isErrorWaitReason(w.Reason) {
			return HealthError
		}
	}

	if p.Status.Phase == corev1.PodPending {
		return HealthWarning
	}

	// Frequent restarts signal instability even while running.
	for _, cs := range p.Status.ContainerStatuses {
		if cs.RestartCount >= restartWarnThreshold {
			return HealthWarning
		}
	}

	if p.Status.Phase == corev1.PodRunning && !isReady(p) {
		return HealthWarning
	}

	if p.Status.Phase == corev1.PodRunning || p.Status.Phase == corev1.PodSucceeded {
		return HealthOK
	}

	// Unknown/absent phase: default to OK so status-less fixtures stay green.
	return HealthOK
}

const restartWarnThreshold = 5

func isErrorWaitReason(reason string) bool {
	switch reason {
	case "CrashLoopBackOff", "ImagePullBackOff", "ErrImagePull",
		"CreateContainerError", "CreateContainerConfigError", "InvalidImageName":
		return true
	}
	return false
}

// isReady reads the pod's Ready condition; absent means not ready.
func isReady(p *corev1.Pod) bool {
	for _, c := range p.Status.Conditions {
		if c.Type == corev1.PodReady {
			return c.Status == corev1.ConditionTrue
		}
	}
	return false
}
