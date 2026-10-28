"use client";

import { useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actions } from "@/lib/client/store";
import type { SavedQuestion } from "@/lib/types";

interface Props {
  /** Element that opens the dialog. */
  trigger: ReactElement;
  question: string;
  /** When given, the dialog edits this saved question instead of creating one. */
  existing?: SavedQuestion;
}

export function SaveQuestionDialog({ trigger, question, existing }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  function onOpenChange(next: boolean) {
    if (next) {
      setName(existing?.name ?? question.replace(/[.?!]+$/, "").slice(0, 60));
      setText(existing?.question ?? question);
    }
    setOpen(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || text.trim().length < 3) return;
    if (existing) {
      actions.updateSaved(existing.id, { name, question: text });
      toast.success("Saved question updated");
    } else {
      actions.saveQuestion(name, text);
      toast.success("Question saved", { description: "Find it any time under Saved questions." });
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{existing ? "Edit saved question" : "Save this question"}</DialogTitle>
            <DialogDescription>Saved questions are stored in this browser and re-run against the latest data.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="sq-name">Name</Label>
            <Input id="sq-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sq-question">Question</Label>
            <Textarea id="sq-question" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || text.trim().length < 3}>
              {existing ? "Save changes" : "Save question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
