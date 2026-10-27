import { useState } from "react";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { api, errorText } from "../../services/api";
import { useAuth } from "../../stores/auth";
import { queryClient } from "../../services/query";
import { Avatar, Button, ErrorBox, Field, Screen } from "../../components/ui";
export default function EditProfile() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (avatar = false) => {
    setBusy(true);
    setError("");
    try {
      if (avatar) {
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
        });
        if (picked.canceled) return;
        const a = picked.assets[0];
        const form = new FormData();
        form.append("avatar", {
          uri: a.uri,
          name: a.fileName || "avatar.jpg",
          type: a.mimeType || "image/jpeg",
        } as unknown as Blob);
        const { data } = await api.post("/me/avatar", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        updateUser(data.data);
      } else {
        const { data } = await api.patch("/me", { name });
        updateUser(data.data);
        router.back();
      }
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      {user && <Avatar user={user} />}
      <Button
        secondary
        title="Change avatar"
        disabled={busy}
        onPress={() => void save(true)}
      />
      <Field
        placeholder="Name"
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      <ErrorBox message={error} />
      <Button
        title="Save profile"
        disabled={busy || !name.trim()}
        onPress={() => void save()}
      />
    </Screen>
  );
}
