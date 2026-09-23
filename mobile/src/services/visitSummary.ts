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
import type { Medication } from "@/services/medicationService";

export const SUMMARY_PREAMBLE =
  "Written by me in the MedHelp app. MedHelp's urgency estimates are not " +
  "diagnoses, and nothing here has been reviewed by a clinician.";

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
  preparedOn: Date;
}): string {
  const lines: string[] = [
    `MedHelp visit summary — prepared ${input.preparedOn.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })}`,
    SUMMARY_PREAMBLE,
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
