import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { AboutPage } from "@/routes/about-page";
import { EntriesPage } from "@/routes/entries-page";
import { EntryDetailPage } from "@/routes/entry-detail-page";
import { ExamplesPage } from "@/routes/examples-page";
import { FlashcardsPage } from "@/routes/flashcards-page";
import { FlashcardListDetailPage } from "@/routes/flashcard-list-detail-page";
import { FlashcardListsPage } from "@/routes/flashcard-lists-page";
import { GamesPage } from "@/routes/games-page";
import { LoginPage } from "@/routes/login-page";
import { MePage } from "@/routes/me-page";
import { ModerationPage } from "@/routes/moderation-page";
import { NotificationsPage } from "@/routes/notifications-page";
import { ProfilePage } from "@/routes/profile-page";
import { RecoverAccountPage } from "@/routes/recover-account-page";
import { ResetPasswordPage } from "@/routes/reset-password-page";
import { SourceDetailPage } from "@/routes/source-detail-page";
import { SignupPage } from "@/routes/signup-page";
import { SubmitPage } from "@/routes/submit-page";
import { UnsubscribePage } from "@/routes/unsubscribe-page";
import { VerifyEmailPage } from "@/routes/verify-email-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <EntriesPage /> },
      { path: "entries", element: <EntriesPage /> },
      { path: "examples", element: <ExamplesPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "games", element: <GamesPage /> },
      { path: "games/flashcards", element: <FlashcardsPage /> },
      { path: "lists", element: <FlashcardListsPage /> },
      { path: "lists/:listId", element: <FlashcardListDetailPage /> },
      { path: "entries/:slug", element: <EntryDetailPage /> },
      { path: "sources/:workId", element: <SourceDetailPage /> },
      { path: "profiles/:userId", element: <ProfilePage /> },
      { path: "submit", element: <SubmitPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "recover", element: <RecoverAccountPage /> },
      { path: "verify-email", element: <VerifyEmailPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
      { path: "unsubscribe", element: <UnsubscribePage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "me", element: <MePage /> },
      { path: "moderation", element: <ModerationPage /> },
    ],
  },
]);
