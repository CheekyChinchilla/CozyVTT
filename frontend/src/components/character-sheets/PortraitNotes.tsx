/**
 * The notes under a sheet editor's portrait: why a picture was refused, and
 * "Saves as personal token" for a character in no campaign.
 *
 * They stand one under the other in one box, which stays in the flow of the
 * portrait's column at every width. Each editor makes that column as wide as
 * its portrait, so the notes wrap under it and the column grows to hold them;
 * hung under the portrait out of the flow on one line, from `sm` up they ran
 * into the field beside it.
 */
interface PortraitNotesProps {
  /** Why the picture was refused, if it was. */
  error: string | null | undefined;
  /** The character is in no campaign, so its picture is a personal token. */
  personal: boolean;
  errorClassName: string;
  noteClassName: string;
}

export default function PortraitNotes({ error, personal, errorClassName, noteClassName }: PortraitNotesProps) {
  if (!error && !personal) return null;
  return (
    <div>
      {error && <div className={`mt-1 text-xs ${errorClassName}`}>{error}</div>}
      {personal && <div className={`mt-1 text-xs ${noteClassName}`}>Saves as personal token</div>}
    </div>
  );
}
