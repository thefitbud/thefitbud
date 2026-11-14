import { SafeAreaView, ScrollView, View } from "react-native";
import {
  Bell,
  CalendarDays,
  House,
  Settings,
  Utensils,
} from "lucide-react-native";
import { Badge } from "./Badge";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { ErrorBanner } from "./ErrorBanner";
import { Field } from "./Field";
import { ListRow } from "./ListRow";
import { Pill } from "./Pill";
import { SegmentedControl } from "./SegmentedControl";
import { Snackbar } from "./Snackbar";
import { StatusChip } from "./StatusChip";
import { TabBar } from "./TabBar";
import { Text } from "./Text";
import {
  ThemeProvider,
  createThemedStyles,
  type ColorScheme,
} from "../providers/ThemeProvider";

const noop = () => undefined;

type Props = {
  /** Force a scheme (render tests, side-by-side review). Omit to follow the system like the app. */
  scheme?: ColorScheme;
  /** Render the sheet open (it is a Modal, so it covers the gallery). */
  sheetOpen?: boolean;
};

/**
 * Every shared primitive on its v3 tokens, in one scrollable page (Z12-36).
 * AppTopBar is left out: it reads the sync engine, so it is checked on the
 * real Today and Needs you screens instead.
 * Used by the light/dark render test, and by the device check once a dev
 * route mounts it (docs/qa/Z12-36/README.md). Copy is sample text for the
 * primitives only; it is never shown to users.
 */
export function PrimitiveGallery({ scheme, sheetOpen = false }: Props) {
  return (
    <ThemeProvider scheme={scheme}>
      <GalleryBody sheetOpen={sheetOpen} />
    </ThemeProvider>
  );
}

function GalleryBody({ sheetOpen }: { sheetOpen: boolean }) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        testID="primitive-gallery"
      >
        <Text variant="label">Type</Text>
        <Text variant="largeTitle">Large title 30</Text>
        <Text variant="title">Title 20</Text>
        <Text variant="headline">Headline 17</Text>
        <Text variant="body">Body 16 regular</Text>
        <Text variant="bodyStrong">Body 16 semibold</Text>
        <Text variant="subhead">Subhead 14</Text>
        <Text variant="caption">Caption 12</Text>
        <Text variant="numberXl">1,240</Text>
        <Text variant="body">
          Inter with Hindi fallback: <Text>आज का प्लान</Text>
        </Text>

        <Text variant="label">Buttons</Text>
        <View style={styles.stack}>
          <Button label="Primary" onPress={noop} />
          <Button label="Secondary" variant="secondary" onPress={noop} />
          <Button label="Tint" variant="tint" onPress={noop} />
          <Button label="Outline" variant="outline" onPress={noop} />
          <Button label="Danger" variant="danger" onPress={noop} />
          <Button label="Quiet danger" variant="dangerQuiet" onPress={noop} />
          <Button label="Text button" variant="text" onPress={noop} />
          <Button label="Disabled" disabled onPress={noop} />
          <Button label="Small" size="sm" variant="secondary" onPress={noop} />
        </View>

        <Text variant="label">Chips, pills, status, badge</Text>
        <View style={styles.row}>
          <Chip label="Default" onPress={noop} />
          <Chip label="Selected" selected onPress={noop} />
          <Chip label="Tint" tone="tint" />
          <Chip label="3 × 10 @ 40 kg" tone="coach" />
          <Chip label="Disabled" disabled onPress={noop} />
        </View>
        <View style={styles.row}>
          <Pill label="Brand" variant="brand" onPress={noop} />
          <Pill label="Tint" variant="tint" />
          <Pill label="Ghost" />
        </View>
        <View style={styles.row}>
          <StatusChip kind="severity" value="critical" />
          <StatusChip kind="severity" value="attention" />
          <StatusChip kind="adherence" value="on_track" />
          <StatusChip kind="ask" value="open" label="Asked" />
          <StatusChip label="Neutral" />
          <Badge count={3} />
          <Badge dot />
        </View>

        <Text variant="label">Card and list</Text>
        <Card>
          <Text variant="headline">Card</Text>
          <Text variant="subhead">Card body on the card surface.</Text>
        </Card>
        <Card due>
          <Text variant="headline">Due card</Text>
          <Text variant="caption">Coral outline means due now.</Text>
        </Card>
        <Card variant="group">
          <ListRow
            title="Reminders"
            value="On"
            icon={(c) => <Bell size={18} color={c} />}
            onPress={noop}
          />
          <ListRow
            title="Meal times"
            subtitle="Breakfast 8:00 am"
            icon={(c) => <Utensils size={18} color={c} />}
            divider
            onPress={noop}
          />
          <ListRow title="Sign out" danger divider onPress={noop} />
        </Card>

        <Text variant="label">Inputs and banners</Text>
        <Field
          label="Weight"
          placeholder="kg"
          hint="Help text under the field."
        />
        <SegmentedControl
          options={[
            { id: "week", label: "Week" },
            { id: "month", label: "Month" },
          ]}
          value="week"
          onChange={noop}
        />
        <ErrorBanner message="Could not save. Your entry is kept on this phone." />

        <Text variant="label">Toast and tab bar</Text>
        <Snackbar
          message="Meal logged"
          leadingCheck
          actionLabel="Undo"
          onAction={noop}
        />
        <TabBar
          items={[
            {
              key: "today",
              label: "Today",
              icon: (c) => <House size={22} color={c} />,
            },
            {
              key: "plan",
              label: "Plan",
              icon: (c) => <CalendarDays size={22} color={c} />,
              badge: 2,
            },
            {
              key: "more",
              label: "More",
              icon: (c) => <Settings size={22} color={c} />,
              badge: "dot",
            },
          ]}
          activeKey="today"
          onSelect={noop}
        />

        <BottomSheet
          visible={sheetOpen}
          title="Sheet title"
          subtitle="Sheet subtitle"
          onDismiss={noop}
        >
          <Text variant="body">
            Sheet content on the card surface over the scrim.
          </Text>
          <Button label="Primary in sheet" onPress={noop} />
        </BottomSheet>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  page: {
    backgroundColor: t.colors.bg,
    flex: 1,
  },
  content: {
    gap: t.spacing.md,
    padding: t.spacing.lg,
    paddingBottom: 120,
  },
  stack: {
    gap: t.spacing.sm,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.spacing.sm,
  },
}));
