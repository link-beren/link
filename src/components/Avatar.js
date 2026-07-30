import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, font } from '../theme';

export default function Avatar({ uri, name, color, bg, size = 40 }) {
  const style = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[style, s.image]} />;
  }

  return (
    <View style={[style, s.fallback, { backgroundColor: bg || colors.primarySoft }]}>
      <Text style={[s.letter, { fontSize: size * 0.4, color: color || colors.primary }]}>
        {(name || '?')[0]?.toUpperCase()}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  image: { backgroundColor: colors.card },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontWeight: font.black },
});
