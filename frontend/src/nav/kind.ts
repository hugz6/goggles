// Short acronym shown on each entity to tell it apart at a glance. An unknown
// kind (CRD) is abbreviated to its first letters.

const ACRONYMS: Record<string, string> = {
  Pod: "POD",
  Deployment: "DEP",
  ReplicaSet: "RS",
  StatefulSet: "STS",
  DaemonSet: "DS",
  Job: "JOB",
  Service: "SVC",
  Ingress: "ING",
  PersistentVolumeClaim: "PVC",
};

export function kindAcronym(kind: string): string {
  return ACRONYMS[kind] ?? kind.slice(0, 3).toUpperCase();
}
