/**
 * The notes under a sheet editor's portrait: why a picture was refused, and
 * "Saves as personal token" for a character in no campaign.
 *
 * On a phone they follow the portrait in the column. From `sm` up the header
 * lays the portrait beside the name, so the notes go in one box placed at the
 * portrait's foot, one under the other; placed one by one, they were drawn
 * over each other when both showed.
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
  // TODO(ui): from `sm` up the box is wider than the portrait and does not
  // wrap, so on the Call of Cthulhu editor "Saves as personal token" runs into
  // the Age box beside it. The notes should stay within the portrait's column.
  return (
    <div className="sm:absolute sm:top-full sm:whitespace-nowrap">
      {error && <div className={`mt-1 text-xs ${errorClassName}`}>{error}</div>}
      {personal && <div className={`mt-1 text-xs ${noteClassName}`}>Saves as personal token</div>}
    </div>
  );
}
