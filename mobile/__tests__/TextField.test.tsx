import { fireEvent, render, screen } from "@testing-library/react-native";
import { TextField } from "@/components/TextField";

it("reveals and hides a password without changing its value", () => {
  const onChangeText = jest.fn();
  render(<TextField label="Password" value="synthetic-secret" onChangeText={onChangeText} secureTextEntry />);
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
  expect(screen.getByLabelText("Password").props.value).toBe("synthetic-secret");
  fireEvent.press(screen.getByRole("button", { name: "Hide password" }));
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  expect(onChangeText).not.toHaveBeenCalled();
});

it("conceals the password while the form is submitting", () => {
  const props = { label: "Password", value: "synthetic-secret", onChangeText: jest.fn(), secureTextEntry: true };
  const { rerender } = render(<TextField {...props} />);
  fireEvent.press(screen.getByRole("button", { name: "Show password" }));
  rerender(<TextField {...props} editable={false} />);
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
});

it("keeps ordinary fields free of password controls", () => {
  render(<TextField label="Email" value="" onChangeText={jest.fn()} />);
  expect(screen.queryByRole("button", { name: "Show password" })).toBeNull();
});
