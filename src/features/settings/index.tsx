import { GearSix } from "@phosphor-icons/react";
import { EmptyState } from "../../shell/EmptyState";

// TASK-016 replaces this empty state with the real settings screen.
export default function Settings() {
  return <EmptyState icon={GearSix} title="Réglages" text="Les réglages arrivent bientôt." />;
}
