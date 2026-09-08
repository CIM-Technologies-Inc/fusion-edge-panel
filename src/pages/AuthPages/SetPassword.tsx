import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "../../icons";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../context/ToastContext";

/**
 * Where an invited user lands from the email link. Supabase turns the link's
 * token into a session automatically; here they choose a password, then go to
 * the app. Also used by the password-reset link.
 */
export default function SetPassword() {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The email link carries a recovery/invite token that the client exchanges
  // for a session. Wait for that session before showing the form.
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(!!data.session);
      setReady(true);
    });

    // The token in the URL may resolve slightly after mount — listen for it.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!active) return;
      setHasSession(!!session);
      setReady(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setError(error.message);
      notify("error", "Couldn’t set password", error.message);
      return;
    }
    notify("success", "Password set", "Welcome to FusionEdge.");
    navigate("/", { replace: true });
  }

  return (
    <>
      <PageMeta
        title="Set your password | FusionEdge"
        description="Create a password to finish setting up your account"
      />
      <AuthLayout>
        <div className="flex flex-col flex-1">
          <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
            <div className="mb-5 sm:mb-8">
              <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                Create your password
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Set a password to finish setting up your account and continue.
              </p>
            </div>

            {!ready ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Loading…
              </p>
            ) : !hasSession ? (
              <p className="text-sm text-error-500">
                This invite link is invalid or has expired. Ask an admin to send
                a new invitation.
              </p>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <div>
                    <Label>
                      New password <span className="text-error-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        type={show ? "text" : "password"}
                        placeholder="At least 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <span
                        onClick={() => setShow(!show)}
                        className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                      >
                        {show ? (
                          <EyeIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                        ) : (
                          <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                        )}
                      </span>
                    </div>
                  </div>

                  <div>
                    <Label>
                      Confirm password <span className="text-error-500">*</span>
                    </Label>
                    <Input
                      type={show ? "text" : "password"}
                      placeholder="Re-enter your password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>

                  {error && <p className="text-sm text-error-500">{error}</p>}

                  <Button
                    className="w-full"
                    size="sm"
                    disabled={saving || !password || !confirm}
                  >
                    {saving ? "Setting password…" : "Set password & continue"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </AuthLayout>
    </>
  );
}
