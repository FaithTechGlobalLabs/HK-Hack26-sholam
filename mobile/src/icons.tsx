import Svg, { Circle, Path, Rect } from "react-native-svg";

/** The website mark: a cross with sunlit billows. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect x="12.5" y="5.85" width="7" height="23.3" rx="3.5" fill="#fff" />
      <Rect x="3.5" y="11.15" width="25" height="7" rx="3.5" fill="#fff" />
      <Circle cx="16.6" cy="6.25" r="3.4" fill="#fff" />
      <Circle cx="13.9" cy="8.35" r="2.1" fill="#fff" />
      <Circle cx="7.2" cy="11.65" r="2.4" fill="#fff" />
      <Circle cx="10.3" cy="10.85" r="2.2" fill="#fff" />
      <Circle cx="21.9" cy="10.75" r="2.3" fill="#fff" />
      <Circle cx="25" cy="11.75" r="2.3" fill="#fff" />
    </Svg>
  );
}

export function IconChat() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 6.5h10.5A2.5 2.5 0 0 1 18 9v5.2a2.5 2.5 0 0 1-2.5 2.5H10l-3.2 2.4V16.7H6.5A2.5 2.5 0 0 1 4 14.2V9A2.5 2.5 0 0 1 6.5 6.5H5Z"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path
        d="M8 5h9.2A2.8 2.8 0 0 1 20 7.8V13"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconCards() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 7.5h11.2A1.8 1.8 0 0 1 21 9.3v9.4a1.8 1.8 0 0 1-1.8 1.8H8.8A1.8 1.8 0 0 1 7 18.7V9.3A1.8 1.8 0 0 1 8.8 7.5H8Z"
        stroke="#fff"
        strokeWidth={1.7}
      />
      <Path
        d="M6.5 16.5 4.8 15.7A1.6 1.6 0 0 1 3.7 13.8L6.2 6.4A1.6 1.6 0 0 1 8.1 5.3L16 4"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconChats() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 7.2h8.2A2.3 2.3 0 0 1 16.5 9.5v4.2A2.3 2.3 0 0 1 14.2 16H9.2L6.4 18v-2H6a2.3 2.3 0 0 1-2.3-2.3V9.5A2.3 2.3 0 0 1 6 7.2Z"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path
        d="M9 6h8.4A2.4 2.4 0 0 1 19.8 8.4V14"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconEnter() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 7V5.8A1.8 1.8 0 0 1 11.8 4h6.4A1.8 1.8 0 0 1 20 5.8v12.4a1.8 1.8 0 0 1-1.8 1.8h-6.4A1.8 1.8 0 0 1 10 18.2V17"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <Path
        d="M4 12h10M11 8.5 14.5 12 11 15.5"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
