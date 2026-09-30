import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Textarea } from "./Input";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "primary",
  requireReason = false,
  reasonOptional = false,
  reasonLabel = "Reason",
  isLoading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "primary" | "danger";
  /** Shows the reason field. Combine with reasonOptional to make it non-blocking. */
  requireReason?: boolean;
  /** When true (with requireReason), the field is shown but not mandatory to confirm. */
  reasonOptional?: boolean;
  reasonLabel?: string;
  isLoading?: boolean;
}) {
  const [reason, setReason] = useState("");
  const canConfirm = !requireReason || reasonOptional || reason.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            disabled={!canConfirm}
            isLoading={isLoading}
            onClick={() => onConfirm(requireReason ? reason : undefined)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-secondary">{description}</p>
      {requireReason && (
        <Textarea
          className="mt-4"
          label={reasonOptional ? `${reasonLabel} (optional)` : reasonLabel}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            reasonOptional
              ? "Optional note for the record — shown to the applicant if provided."
              : "Enter a clear, specific reason. This will be recorded and shown to the applicant."
          }
        />
      )}
    </Modal>
  );
}
