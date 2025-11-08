export const formatNameWithInitial = (firstName?: string, lastName?: string, email?: string): string => {
  if (firstName && lastName) {
    return `${firstName} ${lastName.charAt(0)}.`;
  } else if (firstName) {
    return firstName;
  } else if (email) {
    // Extract the part before @ in email address
    return email.split('@')[0];
  }
  return 'Unknown';
};

export interface MemberForFormatting {
  user_id: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
}

/**
 * Smart name formatting that shows only first name by default,
 * and adds last name initial only when there are duplicate first names.
 * 
 * @param members - Array of members with user_id and profile data
 * @returns Map of user_id to formatted display name
 */
export const formatMemberNames = (members: MemberForFormatting[]): Map<string, string> => {
  const nameMap = new Map<string, string>();
  
  if (!members || members.length === 0) {
    return nameMap;
  }

  // Count occurrences of each first name
  const firstNameCounts = new Map<string, number>();
  
  members.forEach(member => {
    const firstName = member.profiles?.first_name?.trim();
    if (firstName) {
      firstNameCounts.set(firstName, (firstNameCounts.get(firstName) || 0) + 1);
    }
  });

  // Format each member's name
  members.forEach(member => {
    const firstName = member.profiles?.first_name?.trim();
    const lastName = member.profiles?.last_name?.trim();
    const email = member.profiles?.email;

    let displayName: string;

    if (firstName) {
      const count = firstNameCounts.get(firstName) || 1;
      if (count > 1 && lastName) {
        // Duplicate first name - add last name initial
        displayName = `${firstName} ${lastName.charAt(0)}.`;
      } else {
        // Unique first name - show just first name
        displayName = firstName;
      }
    } else if (email) {
      // No first name - use email prefix
      displayName = email.split('@')[0];
    } else {
      displayName = 'Unknown';
    }

    nameMap.set(member.user_id, displayName);
  });

  return nameMap;
};

/**
 * Gets the full name for avatar initials (First Last).
 * This is used by FancyAvatar to extract proper initials like "AG" from "Arnaud Grunwald".
 * 
 * @param firstName - User's first name
 * @param lastName - User's last name  
 * @param email - User's email (fallback)
 * @returns Full name string for avatar initial extraction
 */
export const getFullNameForAvatar = (firstName?: string, lastName?: string, email?: string): string => {
  const first = firstName?.trim();
  const last = lastName?.trim();
  
  if (first && last) {
    return `${first} ${last}`;
  } else if (first) {
    return first;
  } else if (email) {
    return email.split('@')[0];
  }
  return 'Unknown';
};
