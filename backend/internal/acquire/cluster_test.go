package acquire

import (
	"errors"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestCollectForbidden(t *testing.T) {
	deg := newDegraded()
	var dst []int
	forbidden := apierrors.NewForbidden(schema.GroupResource{Resource: "pods"}, "", errors.New("nope"))

	err := collect(&dst, deg, "pods", func() ([]int, error) {
		return nil, forbidden
	})
	if err != nil {
		t.Fatalf("Forbidden must not be fatal, got: %v", err)
	}
	if _, ok := deg.Unloaded["pods"]; !ok {
		t.Error("the denied type must be marked unloaded")
	}
}

func TestCollectNotFound(t *testing.T) {
	deg := newDegraded()
	var dst []int
	notFound := apierrors.NewNotFound(schema.GroupResource{Resource: "ingresses"}, "")

	if err := collect(&dst, deg, "ingresses", func() ([]int, error) { return nil, notFound }); err != nil {
		t.Fatalf("NotFound must not be fatal, got: %v", err)
	}
	if _, ok := deg.Unloaded["ingresses"]; !ok {
		t.Error("the missing type must be marked unloaded")
	}
}

func TestCollectFatalError(t *testing.T) {
	deg := newDegraded()
	var dst []int

	err := collect(&dst, deg, "pods", func() ([]int, error) {
		return nil, errors.New("connection refused")
	})
	if err == nil {
		t.Fatal("a non-RBAC error must be fatal")
	}
	if len(deg.Unloaded) != 0 {
		t.Error("a fatal error must not mark the type degraded")
	}
}

func TestCollectFillsDst(t *testing.T) {
	var dst []metav1.ObjectMeta

	err := collect(&dst, newDegraded(), "pods", func() ([]metav1.ObjectMeta, error) {
		return []metav1.ObjectMeta{{Name: "a"}, {Name: "b"}}, nil
	})
	if err != nil {
		t.Fatalf("unexpected error on success: %v", err)
	}
	if len(dst) != 2 {
		t.Errorf("want 2 items, got %d", len(dst))
	}
}
