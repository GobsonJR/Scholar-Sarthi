import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileText, Image as ImageIcon } from "lucide-react";
import { cn } from "../../utils/cn";
import { formatFileSize } from "../../utils/format";

const DEFAULT_ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const DEFAULT_MAX_SIZE_MB = 10;

const TYPE_LABELS: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/jpg": "JPG", "image/png": "PNG" };

export function FileUploader({
  onFileSelected,
  disabled,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
}: {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  acceptedTypes?: string[];
  maxSizeMb?: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxSizeBytes = maxSizeMb * 1024 * 1024;
  const formatLabel = Array.from(new Set(acceptedTypes.map((t) => TYPE_LABELS[t] ?? t))).join(", ");

  const validateAndEmit = useCallback(
    (file: File) => {
      setError(null);
      if (!acceptedTypes.includes(file.type)) {
        setError(`File type not supported. Accepted formats: ${formatLabel}.`);
        return;
      }
      if (file.size > maxSizeBytes) {
        setError(`File is too large. Maximum size is ${maxSizeMb}MB.`);
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected, acceptedTypes, maxSizeBytes, maxSizeMb, formatLabel],
  );

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) validateAndEmit(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          isDragging ? "border-primary bg-primary-light" : "border-border bg-slate-50 hover:bg-slate-100",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <div className="rounded-full bg-white p-2.5 shadow-sm">
          <UploadCloud className="h-5 w-5 text-primary" />
        </div>
        <p className="text-sm font-medium text-text">Drag & drop your file here, or click to browse</p>
        <p className="flex items-center gap-2 text-xs text-text-secondary">
          <FileText className="h-3.5 w-3.5" />
          <ImageIcon className="h-3.5 w-3.5" /> {formatLabel} — up to {maxSizeMb}MB
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={acceptedTypes.join(",")}
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) validateAndEmit(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function FileMeta({ file }: { file: { name: string; size: number } }) {
  return (
    <p className="text-xs text-text-secondary">
      {file.name} · {formatFileSize(file.size)}
    </p>
  );
}
