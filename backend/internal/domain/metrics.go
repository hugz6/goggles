package domain

import "g5s/internal/acquire"

type podUsage struct {
	cpuMillis int64
	memBytes  int64
}

// metricsByPod indexes usage by "namespace/name"; empty without metrics-server.
func metricsByPod(o *acquire.Objects) map[string]podUsage {
	usage := make(map[string]podUsage, len(o.PodMetrics))
	for i := range o.PodMetrics {
		pm := &o.PodMetrics[i]
		var u podUsage
		for _, c := range pm.Containers {
			if cpu := c.Usage.Cpu(); cpu != nil {
				u.cpuMillis += cpu.MilliValue()
			}
			if mem := c.Usage.Memory(); mem != nil {
				u.memBytes += mem.Value()
			}
		}
		usage[pm.Namespace+"/"+pm.Name] = u
	}
	return usage
}
