import { GuestbookForm } from "./guestbook-form";

import type { GuestbookFormState } from "./actions";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

// Stub action — keeps the server-only Server Action out of the browser bundle.
const stubAction = async (): Promise<GuestbookFormState> => ({ status: "success" });

// Intl is provided globally by .storybook/preview.tsx; this decorator only sizes the form.
const meta: Meta<typeof GuestbookForm> = {
  title: "Components/GuestbookForm",
  component: GuestbookForm,
  args: { action: stubAction },
  decorators: [
    (Story) => (
      <div className="max-w-md p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof GuestbookForm>;

export const Default: Story = {};
