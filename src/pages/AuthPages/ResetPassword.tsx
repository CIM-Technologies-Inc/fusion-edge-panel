import { useState } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../context/ToastContext";

/**
 * "Forgot password" — step 1 of the reset flow. The user enters their email and
 * Supabase sends a recovery link that lands on /set-password (step 2), where the
 * link's token becomes a session and they choose a new password.
 */
export default function ResetPassword() {
  const { notify } = useToast();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // Where the email link lands — the page that reads the recovery token and
      // lets the user set a new password.
      redirectTo: `${window.location.origin}/set-password`,
    });
    setSubmitting(false);

    if (error) {
      setError(error.message);
      notify("error", "Couldn’t send reset email", error.message);
      return;
    }
    // Always land on the same confirmation so we don't reveal whether an email
    // is registered.
    setSent(true);
  }

  return (
    <>
      <PageMeta
        title="Reset password | FusionEdge"
        description="Request a password reset link"
      />
      <AuthLayout>
        <div className="flex flex-col flex-1">
          <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
            <div className="mb-5 sm:mb-8">
              <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                Forgot your password?
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enter your email and we’ll send you a link to reset it.
              </p>
            </div>

            {sent ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-success-500/30 bg-success-50 p-4 dark:border-success-500/30 dark:bg-success-500/10">
                  <p className="text-sm text-success-700 dark:text-success-400">
                    If an account exists for <strong>{email.trim()}</strong>,
                    we’ve sent a password-reset link. Check your inbox (and spam
                    folder) and follow the link to choose a new password.
                  </p>
                </div>
                <Link
                  to="/signin"
                  className="inline-block text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  ← Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <div>
                    <Label>
                      Email <span className="text-error-500">*</span>
                    </Label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  {error && <p className="text-sm text-error-500">{error}</p>}

                  <Button
                    className="w-full"
                    size="sm"
                    disabled={submitting || !email}
                  >
                    {submitting ? "Sending…" : "Send reset link"}
                  </Button>

                  <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                    Remembered it?{" "}
                    <Link
                      to="/signin"
                      className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                    >
                      Back to sign in
                    </Link>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </AuthLayout>
    </>
  );
}
