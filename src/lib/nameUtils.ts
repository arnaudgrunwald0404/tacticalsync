export const formatNameWithInitial = (firstName?: string, lastName?: string, email?: string): string => {
  if (firstName && lastName) {
    return `${firstName} ${lastName.charAt(0)}.`;
  } else if (firstName) {
    return firstName;
  } else if (email) {
    return email;
  }
  return 'Unknown';
};
