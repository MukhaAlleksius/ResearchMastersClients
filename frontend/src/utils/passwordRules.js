export function validatePassword(password) {
  if (!password || password.length < 8 || password.length > 128) {
    return "Пароль должен содержать от 8 до 128 символов";
  }
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
    return "Пароль должен содержать и буквы, и цифры";
  }
  return "";
}
