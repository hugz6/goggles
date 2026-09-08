// Navigation state machine: namespace -> entity -> container.

import type { NavModel } from "./model";

export type NavLevel = "namespace" | "entity" | "container";

const ORDER: NavLevel[] = ["namespace", "entity", "container"];

export interface Selection {
  level: NavLevel;
  namespace: string;
  entityId?: string;
  containerName?: string;
}

export class Navigation {
  private level: NavLevel = "namespace";
  private index: Record<NavLevel, number> = {
    namespace: 0,
    entity: 0,
    container: 0,
  };

  constructor(private readonly model: NavModel) {}

  reset(): void {
    this.level = "namespace";
    this.index = { namespace: 0, entity: 0, container: 0 };
  }

  private namespace(): string {
    return this.model.groups[this.index.namespace] ?? "";
  }

  private entityId(): string | undefined {
    const list = this.model.entitiesByGroup.get(this.namespace()) ?? [];
    return list[this.index.entity];
  }

  private siblings(level: NavLevel): string[] {
    switch (level) {
      case "namespace":
        return this.model.groups;
      case "entity":
        return this.model.entitiesByGroup.get(this.namespace()) ?? [];
      case "container": {
        const e = this.model.nodeById.get(this.entityId() ?? "");
        return (e?.containers ?? []).map((c) => c.name);
      }
    }
  }

  siblingIds(): string[] {
    return this.siblings(this.level);
  }

  currentIndex(): number {
    return this.index[this.level];
  }

  setIndex(i: number): void {
    const list = this.siblings(this.level);
    if (i < 0 || i >= list.length) {
      return;
    }
    this.index[this.level] = i;
    this.resetDescendants(this.level);
  }

  selectEntity(namespace: string, entityId: string): boolean {
    const nsi = this.model.groups.indexOf(namespace);
    if (nsi < 0) {
      return false;
    }
    const ents = this.model.entitiesByGroup.get(namespace) ?? [];
    const ei = ents.indexOf(entityId);
    if (ei < 0) {
      return false;
    }
    this.level = "entity";
    this.index.namespace = nsi;
    this.index.entity = ei;
    this.index.container = 0;
    return true;
  }

  selectNamespace(namespace: string): boolean {
    const nsi = this.model.groups.indexOf(namespace);
    if (nsi < 0) {
      return false;
    }
    this.level = "namespace";
    this.index.namespace = nsi;
    this.index.entity = 0;
    this.index.container = 0;
    return true;
  }

  enter(): void {
    const i = ORDER.indexOf(this.level);
    if (i >= ORDER.length - 1) {
      return;
    }
    const child = ORDER[i + 1];
    if (this.siblings(child).length === 0) {
      return;
    }
    this.level = child;
    this.index[child] = 0;
  }

  back(): void {
    const i = ORDER.indexOf(this.level);
    if (i > 0) {
      this.level = ORDER[i - 1];
    }
  }

  private resetDescendants(level: NavLevel): void {
    const i = ORDER.indexOf(level);
    for (let j = i + 1; j < ORDER.length; j++) {
      this.index[ORDER[j]] = 0;
    }
  }

  current(): Selection {
    const namespace = this.namespace();
    if (this.level === "namespace") {
      return { level: this.level, namespace };
    }
    const entityId = this.entityId();
    if (this.level === "entity") {
      return { level: this.level, namespace, entityId };
    }
    return {
      level: this.level,
      namespace,
      entityId,
      containerName: this.siblings("container")[this.index.container],
    };
  }
}
