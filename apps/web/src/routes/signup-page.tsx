import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { register } from "@/features/auth/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(2),
});

type SignupForm = z.infer<typeof schema>;

export function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<SignupForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      display_name: "",
    },
  });

  const signupMutation = useMutation({
    mutationFn: register,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/entries");
    },
  });

  return (
    <Card>
      <h1 className="text-xl font-semibold text-brand-900">Create account</h1>
      <form className="mt-4 space-y-3" onSubmit={form.handleSubmit((values) => signupMutation.mutate(values))}>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="display_name">
            Display name
          </label>
          <Input id="display_name" {...form.register("display_name")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <Input id="email" type="email" {...form.register("email")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="password">
            Password
          </label>
          <Input id="password" type="password" {...form.register("password")} />
        </div>
        {signupMutation.error instanceof ApiError ? (
          <p className="text-sm text-red-700">{signupMutation.error.message}</p>
        ) : null}
        <Button type="submit" disabled={signupMutation.isPending}>
          Create account
        </Button>
      </form>
    </Card>
  );
}
