// A distinct geometry per Kubernetes kind, to tell them apart at a glance.

import {
  BufferGeometry,
  SphereGeometry,
  BoxGeometry,
  OctahedronGeometry,
  IcosahedronGeometry,
  DodecahedronGeometry,
  TetrahedronGeometry,
  ConeGeometry,
  CylinderGeometry,
  TorusGeometry,
  TorusKnotGeometry,
} from "three";

// tilt avoids a flat face aligning with the camera, so volume reads better.
function tilt(g: BufferGeometry): BufferGeometry {
  g.rotateX(0.5);
  g.rotateY(0.5);
  return g;
}

export function geometryForKind(kind: string): BufferGeometry {
  switch (kind) {
    case "Pod":
      return new SphereGeometry(1.6, 16, 16);
    case "Deployment":
      return tilt(new BoxGeometry(2.4, 2.4, 2.4));
    case "ReplicaSet":
      return tilt(new OctahedronGeometry(1.9));
    case "StatefulSet":
      return tilt(new IcosahedronGeometry(1.8));
    case "DaemonSet":
      return tilt(new DodecahedronGeometry(1.8));
    case "Job":
      return tilt(new TetrahedronGeometry(2.1));
    case "Service":
      return tilt(new TorusGeometry(1.3, 0.5, 10, 20));
    case "Ingress":
      return tilt(new ConeGeometry(1.5, 2.6, 6));
    case "PersistentVolumeClaim":
      return tilt(new CylinderGeometry(1.3, 1.3, 2, 16));
    default:
      return new TorusKnotGeometry(1, 0.32, 64, 8); // custom resource (CRD)
  }
}
