import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';

interface ProfileAvatarProps {
  name: string;
  profileImage?: string | null;
  size?: number;
  style?: ViewStyle;
  showOnlineStatus?: boolean;
  isOnline?: boolean;
}

// Generate consistent color from name
const getAvatarColor = (name: string): string => {
  const colors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#8B5CF6', // purple
    '#F59E0B', // amber
    '#EF4444', // red
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#6366F1', // indigo
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Get initials from name
const getInitials = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  name,
  profileImage,
  size = 48,
  style,
  showOnlineStatus = false,
  isOnline = false,
}) => {
  const initials = getInitials(name);
  const backgroundColor = getAvatarColor(name);
  const fontSize = size * 0.4;
  const onlineStatusSize = size * 0.25;

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      {profileImage ? (
        <Image
          source={{ uri: profileImage }}
          style={[
            styles.image,
            { width: size, height: size, borderRadius: size / 2 }
          ]}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.initialsContainer,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor,
            }
          ]}
        >
          <Text style={[styles.initialsText, { fontSize }]}>
            {initials}
          </Text>
        </View>
      )}
      
      {showOnlineStatus && (
        <View
          style={[
            styles.onlineStatus,
            {
              width: onlineStatusSize,
              height: onlineStatusSize,
              borderRadius: onlineStatusSize / 2,
              backgroundColor: isOnline ? '#10B981' : '#6B7280',
              right: 0,
              bottom: 0,
            }
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    backgroundColor: '#1E293B',
  },
  initialsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  onlineStatus: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
});

export default ProfileAvatar;
