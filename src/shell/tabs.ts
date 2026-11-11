import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  ChatCircleDots,
  ChartBar,
  GearSix,
  Brain,
  Robot,
  ShareNetwork,
  FolderSimple,
  type Icon,
} from "@phosphor-icons/react";

export type TabId = "chat" | "agents" | "projects" | "brain" | "graph" | "usage" | "settings";

// Chat and Agents are not listed: App keeps it mounted so a tab switch never ends the session.
export const TABS: { id: TabId; label: string; icon: Icon; view?: LazyExoticComponent<ComponentType> }[] = [
  { id: "chat", label: "Chat", icon: ChatCircleDots },
  { id: "agents", label: "Agents", icon: Robot }, // rendered by App, which feeds it the sub-agent cards
  { id: "projects", label: "Projets", icon: FolderSimple, view: lazy(() => import("../features/projects")) },
  { id: "brain", label: "Second cerveau", icon: Brain, view: lazy(() => import("../features/brain")) },
  { id: "graph", label: "Graphe", icon: ShareNetwork, view: lazy(() => import("../features/graph")) },
  { id: "usage", label: "Usage", icon: ChartBar, view: lazy(() => import("../features/usage")) },
  { id: "settings", label: "Réglages", icon: GearSix, view: lazy(() => import("../features/settings")) },
];

export const isTabId = (v: unknown): v is TabId => TABS.some((t) => t.id === v);
