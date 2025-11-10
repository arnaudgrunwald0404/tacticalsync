import { describe, it, expect } from 'vitest';
import {
  formatNameWithInitial,
  formatMemberNames,
  getFullNameForAvatar,
  type MemberForFormatting,
} from '@/lib/nameUtils';

describe('nameUtils', () => {
  describe('formatNameWithInitial', () => {
    it('should format full name with last initial', () => {
      const result = formatNameWithInitial('John', 'Doe', 'john@example.com');
      expect(result).toBe('John D.');
    });

    it('should return first name only when no last name', () => {
      const result = formatNameWithInitial('John', undefined, 'john@example.com');
      expect(result).toBe('John');
    });

    it('should extract email prefix when no names provided', () => {
      const result = formatNameWithInitial(undefined, undefined, 'john.doe@example.com');
      expect(result).toBe('john.doe');
    });

    it('should return "Unknown" when no data provided', () => {
      const result = formatNameWithInitial(undefined, undefined, undefined);
      expect(result).toBe('Unknown');
    });

    it('should handle empty strings', () => {
      const result = formatNameWithInitial('', '', '');
      expect(result).toBe('Unknown');
    });
  });

  describe('formatMemberNames', () => {
    it('should format unique first names without last initial', () => {
      const members: MemberForFormatting[] = [
        {
          user_id: '1',
          profiles: { first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
        },
        {
          user_id: '2',
          profiles: { first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com' },
        },
      ];

      const result = formatMemberNames(members);
      expect(result.get('1')).toBe('John');
      expect(result.get('2')).toBe('Jane');
    });

    it('should add last initial for duplicate first names', () => {
      const members: MemberForFormatting[] = [
        {
          user_id: '1',
          profiles: { first_name: 'John', last_name: 'Doe', email: 'john.doe@example.com' },
        },
        {
          user_id: '2',
          profiles: { first_name: 'John', last_name: 'Smith', email: 'john.smith@example.com' },
        },
      ];

      const result = formatMemberNames(members);
      expect(result.get('1')).toBe('John D.');
      expect(result.get('2')).toBe('John S.');
    });

    it('should handle members with only email', () => {
      const members: MemberForFormatting[] = [
        {
          user_id: '1',
          profiles: { email: 'john.doe@example.com' },
        },
      ];

      const result = formatMemberNames(members);
      expect(result.get('1')).toBe('john.doe');
    });

    it('should handle members with null profiles', () => {
      const members: MemberForFormatting[] = [
        {
          user_id: '1',
          profiles: null,
        },
      ];

      const result = formatMemberNames(members);
      expect(result.get('1')).toBe('Unknown');
    });

    it('should handle empty array', () => {
      const result = formatMemberNames([]);
      expect(result.size).toBe(0);
    });

    it('should trim whitespace from names', () => {
      const members: MemberForFormatting[] = [
        {
          user_id: '1',
          profiles: { first_name: '  John  ', last_name: '  Doe  ' },
        },
      ];

      const result = formatMemberNames(members);
      expect(result.get('1')).toBe('John');
    });

    it('should handle duplicate first names when one has no last name', () => {
      const members: MemberForFormatting[] = [
        {
          user_id: '1',
          profiles: { first_name: 'John', last_name: 'Doe' },
        },
        {
          user_id: '2',
          profiles: { first_name: 'John' },
        },
      ];

      const result = formatMemberNames(members);
      expect(result.get('1')).toBe('John D.');
      expect(result.get('2')).toBe('John');
    });
  });

  describe('getFullNameForAvatar', () => {
    it('should return full name when both names provided', () => {
      const result = getFullNameForAvatar('John', 'Doe', 'john@example.com');
      expect(result).toBe('John Doe');
    });

    it('should return first name only when no last name', () => {
      const result = getFullNameForAvatar('John', undefined, 'john@example.com');
      expect(result).toBe('John');
    });

    it('should extract email prefix when no names provided', () => {
      const result = getFullNameForAvatar(undefined, undefined, 'john.doe@example.com');
      expect(result).toBe('john.doe');
    });

    it('should return "Unknown" when no data provided', () => {
      const result = getFullNameForAvatar(undefined, undefined, undefined);
      expect(result).toBe('Unknown');
    });

    it('should trim whitespace from names', () => {
      const result = getFullNameForAvatar('  John  ', '  Doe  ');
      expect(result).toBe('John Doe');
    });

    it('should handle empty strings', () => {
      const result = getFullNameForAvatar('', '', '');
      expect(result).toBe('Unknown');
    });
  });
});

