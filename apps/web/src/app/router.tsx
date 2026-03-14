import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { EntriesPage } from "@/routes/entries-page";
import { EntryDetailPage } from "@/routes/entry-detail-page";
import { LoginPage } from "@/routes/login-page";
import { MePage } from "@/routes/me-page";
import { ModerationPage } from "@/routes/moderation-page";
import { ProfilePage } from "@/routes/profile-page";
import { SignupPage } from "@/routes/signup-page";
import { SubmitPage } from "@/routes/submit-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <EntriesPage /> },
      { path: "entries", element: <EntriesPage /> },
      { path: "entries/:slug", element: <EntryDetailPage /> },
      { path: "profiles/:userId", element: <ProfilePage /> },
      { path: "submit", element: <SubmitPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "me", element: <MePage /> },
      { path: "moderation", element: <ModerationPage /> },
    ],
  },
]);
