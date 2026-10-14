import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeApostrophes } from "@/lib/text";

describe("apostrophes in text fields", () => {
  it.each(["‘", "’", "‚", "‛", "ʻ", "ʼ", "′", "‵", "＇"])(
    "treats %s as a glottal apostrophe without changing other letters",
    (apostrophe) => {
      expect(normalizeApostrophes(`e${apostrophe}õ${apostrophe}ar`)).toBe("e'õ'ar");
      expect(normalizeApostrophes("'ara, ã î û: “tupi”")).toBe("'ara, ã î û: “tupi”");
    },
  );

  it.each([Input, Textarea])("normalizes controlled typing and pasted text", async (Field) => {
    function ControlledField() {
      const [value, setValue] = useState("");
      return <Field aria-label="word" value={value} onChange={(event) => setValue(event.target.value)} />;
    }
    const user = userEvent.setup();
    render(<ControlledField />);
    const field = screen.getByRole("textbox");
    await user.type(field, "a’e");
    expect(field).toHaveValue("a'e");
    await user.clear(field);
    await user.paste("e‘õʼar");
    expect(field).toHaveValue("e'õ'ar");
  });

  it("preserves the caret when an apostrophe is inserted in the middle", () => {
    render(<Textarea aria-label="sentence" />);
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "tembi’u rest", selectionStart: 6, selectionEnd: 6 } });
    expect(field).toHaveValue("tembi'u rest");
    expect(field.selectionStart).toBe(6);
    expect(field.selectionEnd).toBe(6);
  });

  it("passes canonical text to React Hook Form registration and submission", async () => {
    const onSubmit = vi.fn();
    function Form() {
      const { register, handleSubmit } = useForm<{ headword: string; sentence: string }>();
      return (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Input aria-label="word" {...register("headword")} />
          <Textarea aria-label="sentence" {...register("sentence")} />
          <button type="submit">Save</button>
        </form>
      );
    }
    const user = userEvent.setup();
    render(<Form />);
    await user.type(screen.getByLabelText("word"), "tembi’u");
    await user.type(screen.getByLabelText("sentence"), "a‘e e’õ’ar");
    await user.click(screen.getByText("Save"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({ headword: "tembi'u", sentence: "a'e e'õ'ar" });
  });

  it.each(["password", "email", "url"])("preserves exact values in %s fields", async (type) => {
    render(<Input aria-label="exact" type={type} />);
    const field = screen.getByLabelText("exact");
    await userEvent.setup().type(field, "a’b");
    expect(field).toHaveValue("a’b");
  });
});
