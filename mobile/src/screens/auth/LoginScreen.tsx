import { useRef, useState } from "react";
import type { TextInput } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { AuthShell } from "@/components/AuthShell";
import { ErrorNotice } from "@/components/ErrorNotice";
import { SuccessNotice } from "@/components/SuccessNotice";
import { TextField } from "@/components/TextField";
import { AuthError, login } from "@/services/authService";
import type { RootStackParamList } from "@/types/navigation";
import { validateEmail, validateLoginPassword } from "@/utils/validation";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation, route }: Props) {
  const accountCreated = route.params?.accountCreated ?? false;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const requestPending = useRef(false);

  const handleLogin = async () => {
    // Guards against a double tap firing two login requests.
    if (requestPending.current) return;

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validateLoginPassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    setIsOffline(false);

    if (nextEmailError || nextPasswordError) {
      if (nextEmailError) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    requestPending.current = true;
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigation.replace("Home");
    } catch (error) {
      if (error instanceof AuthError) {
        setFormError(error.message);
        setIsOffline(error.isNetworkError);
      } else {
        setFormError("Something stopped us signing you in. Please try again in a moment.");
      }
    } finally {
      requestPending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your medication reminders."
    >
      {accountCreated && !formError && (
        <SuccessNotice message="Your account is ready. Sign in to get started." />
      )}

      {formError && (
        <ErrorNotice
          message={formError}
          // Retrying only makes sense when the request never reached the
          // server; re-sending the same wrong password would just fail again.
          onRetry={isOffline ? handleLogin : undefined}
        />
      )}

      <TextField
        ref={emailRef}
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (emailError) setEmailError(validateEmail(value));
          setFormError(null);
          setIsOffline(false);
        }}
        error={emailError}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!submitting}
      />

      <TextField
        ref={passwordRef}
        label="Password"
        placeholder="Your password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (passwordError) setPasswordError(validateLoginPassword(value));
          setFormError(null);
          setIsOffline(false);
        }}
        error={passwordError}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        // Lets the keyboard's Go key (and Enter in the browser) submit.
        onSubmitEditing={handleLogin}
        editable={!submitting}
      />

      <AppButton
        label={submitting ? "Signing in…" : "Log in"}
        onPress={handleLogin}
        loading={submitting}
        accessibilityHint="Signs you in to MedHelp"
      />

      <AppButton
        label="Need an account? Sign up"
        variant="secondary"
        onPress={() => navigation.navigate("Signup")}
        disabled={submitting}
      />
    </AuthShell>
  );
}
