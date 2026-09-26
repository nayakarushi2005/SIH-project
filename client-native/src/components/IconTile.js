import { View } from 'react-native';

import { shade } from '../utils/color';

export default function IconTile({ icon: Icon, color, size = 60, round = false }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : Math.round(size * 0.3),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color,
        experimental_backgroundImage: `linear-gradient(160deg, ${shade(color, 0.18)} 0%, ${color} 100%)`,
      }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Icon size={Math.round(size * 0.5)} color="#FFFFFF" strokeWidth={2.25} />
    </View>
  );
}
