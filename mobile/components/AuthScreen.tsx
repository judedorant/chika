import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../stores/auth";
import { errorText } from "../services/api";
import { Button, ErrorBox, Field, Label, Screen, Title } from "./ui";
export function AuthScreen({ register = false }: { register?: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await useAuth
        .getState()
        .authenticate(register ? "register" : "login", {
          name,
          email,
          password,
          password_confirmation: confirmation,
        });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <Screen>
        <Title>{register ? "Your people, closer." : "Welcome to RChat"}</Title>
        <Label muted>Private conversations. Shared moments.</Label>
        {register && (
          <Field
            placeholder="Name"
            value={name}
            onChangeText={setName}
            autoComplete="name"
          />
        )}
        <Field
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={register ? "new-password" : "current-password"}
        />
        {register && (
          <>
            <Label muted>
              Use at least 12 characters with uppercase, lowercase, and a
              number.
            </Label>
            <Field
              placeholder="Confirm password"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
            />
          </>
        )}
        <ErrorBox message={error} />
        <Button
          title={
            busy ? "Please wait…" : register ? "Create account" : "Sign in"
          }
          disabled={busy || !email || !password}
          onPress={() => void submit()}
        />
        <Link
          href={register ? "/login" : "/register"}
          style={{ color: "#4d65e8", padding: 12 }}
        >
          {register
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </Link>
      </Screen>
    </KeyboardAvoidingView>
  );
}
