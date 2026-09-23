/**
 * A visit summary: what somebody told MedHelp, set out so they can hand it to
 * a clinician.
 *
 * ⛔ IT IS A RECEIPT, NOT AN INTERPRETATION. Every health fact in it is the
 * person's own text or a field they typed, copied verbatim — descriptions,
 * follow-up answers, medication names, doses and directions. Nothing is
 * summarised, grouped, ranked, or turned into a sentence MedHelp wrote about
 * them. A summary that paraphrased would be app-authored clinical content,
 * the one thing CLAUDE.md forbids outright, and a clinician reading it could
 * not tell which words were the patient's.
 *
 * The only words MedHelp adds are fixed headings and the tier label the
 * person was already shown, marked as MedHelp's estimate. No condition is
 * named anywhere, because nothing that is not the person's own text can name
 * one.
 *
 * ⛔ It is built on the device and leaves only through the person's own share
 * sheet. Nothing is uploaded to make it.
 */

import { PAST_TIER_LABELS, type PastAssessment } from "@/services/intakeService";
import type { HealthProfile } from "@/services/healthProfileService";
import type { Medication } from "@/services/medicationService";

const NOT_A_DIAGNOSIS =
  "MedHelp's urgency estimates are not diagnoses, and nothing here has been " +
  "reviewed by a clinician.";

export const SUMMARY_PREAMBLE = `Written by me in the MedHelp app. ${NOT_A_DIAGNOSIS}`;

/** For someone else's summary: who wrote it is not who it is about. */
export function caregiverPreamble(name: string): string {
  return `Written in the MedHelp app by the person who looks after ${name}. ${NOT_A_DIAGNOSIS}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildVisitSummary(input: {
  assessments: PastAssessment[];
  medications: Medication[] | null;
  /** `null` when it could not be loaded — said so, never silently omitted. */
  healthProfile?: HealthProfile | null;
  preparedOn: Date;
  /** Whose summary, when it is not the account holder's. */
  forName?: string | null;
}): string {
  const lines: string[] = [
    `MedHelp visit summary${input.forName ? ` for ${input.forName}` : ""} — prepared ${input.preparedOn.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })}`,
    input.forName ? caregiverPreamble(input.forName) : SUMMARY_PREAMBLE,
  ];

  if (input.assessments.length > 0) {
    lines.push("", "WHAT I DESCRIBED");
    // Oldest first: a clinician reads a history forwards.
    for (const past of [...input.assessments].reverse()) {
      lines.push(
        "",
        `${formatDate(past.createdAt)} — MedHelp's urgency estimate: ${PAST_TIER_LABELS[past.tier]}`,
        `"${past.description}"`
      );
      for (const entry of past.summary?.understood ?? []) {
        lines.push(`  ${entry.label}: ${entry.value}`);
      }
      if (past.summary && past.summary.unclear.length > 0) {
        lines.push(`  Not answered: ${past.summary.unclear.join(", ")}`);
      }
    }
  }

  if (input.medications !== null) {
    lines.push("", "MEDICATIONS I HAVE RECORDED");
    if (input.medications.length === 0) {
      // Said, not omitted: a missing section reads as "takes nothing".
      lines.push("None recorded in MedHelp.");
    }
    for (const medication of input.medications) {
      const parts = [medication.name, medication.dosage, medication.frequency && `"${medication.frequency}"`]
        .filter(Boolean)
        .join(" — ");
      lines.push(`- ${parts}`);
    }
  }

  // ⛔ Allergies and conditions are always present as sections. A missing
  // allergies line reads as "no allergies", so an empty list and a failed
  // load are both said in words. Entries are quoted as the person typed them.
  if (input.healthProfile !== undefined) {
    for (const [heading, key] of [
      ["ALLERGIES I HAVE RECORDED", "allergies"],
      ["CONDITIONS I HAVE RECORDED", "conditions"],
    ] as const) {
      lines.push("", heading);
      if (input.healthProfile === null) {
        lines.push("Could not be loaded when this summary was prepared.");
      } else if (input.healthProfile[key].length === 0) {
        lines.push("Not recorded in MedHelp.");
      } else {
        for (const entry of input.healthProfile[key]) lines.push(`- ${entry}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Hand the text to the platform share sheet, falling back to the clipboard on
 * a browser that has no share sheet. Resolves with what actually happened, so
 * the screen never says "shared" when nothing left the device.
 */
export async function shareSummary(
  text: string,
  share: (content: { message: string; title?: string }) => Promise<{ action: string }>
): Promise<"shared" | "copied" | "dismissed" | "failed"> {
  try {
    const result = await share({ message: text, title: "MedHelp visit summary" });
    return result.action === "dismissedAction" ? "dismissed" : "shared";
  } catch {
    const clipboard = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } })
      .navigator?.clipboard;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(text);
        return "copied";
      } catch {
        return "failed";
      }
    }
    return "failed";
  }
}
