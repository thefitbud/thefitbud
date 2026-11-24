/**
 * A stand-in for `ListScreen` in screen tests (Z14-21).
 *
 * The render harness has no layout engine, so a real virtualised list draws
 * only its first rows and never reports its end. This double draws every row
 * and exposes the list's `onEndReached` / `onRefresh` as two buttons, so a
 * screen test can drive paging through the screen's own wiring. The real
 * list's windowing and end detection are covered by `ListScreen.test.tsx`.
 */
import { Fragment, type ReactNode } from "react";

type Section = { data: readonly unknown[] } & Record<string, unknown>;

type DoubleProps = {
  header?: ReactNode;
  empty?: ReactNode;
  listFooter?: ReactNode;
  footer?: ReactNode;
  data?: readonly unknown[];
  sections?: readonly Section[];
  keyExtractor: (item: never, index: number) => string;
  renderItem: (info: { item: never; index: number; section?: never }) => ReactNode;
  renderSectionHeader?: (info: { section: never }) => ReactNode;
  onEndReached?: () => void;
  onRefresh?: () => void;
  testID?: string;
};

export function ListScreenDouble(props: DoubleProps) {
  const rows = props.sections
    ? props.sections.map((section, sectionIndex) => (
        <Fragment key={sectionIndex}>
          {props.renderSectionHeader?.({ section: section as never })}
          {section.data.map((item, index) => (
            <Fragment key={props.keyExtractor(item as never, index)}>
              {props.renderItem({ item: item as never, index, section: section as never })}
            </Fragment>
          ))}
        </Fragment>
      ))
    : (props.data ?? []).map((item, index) => (
        <Fragment key={props.keyExtractor(item as never, index)}>
          {props.renderItem({ item: item as never, index })}
        </Fragment>
      ));
  return (
    <div role="main" data-testid={props.testID}>
      {props.header}
      {rows}
      {props.empty}
      {props.listFooter}
      <button type="button" data-testid="list-end" onClick={() => props.onEndReached?.()}>
        end reached
      </button>
      <button type="button" data-testid="list-refresh" onClick={() => props.onRefresh?.()}>
        refresh
      </button>
      {props.footer}
    </div>
  );
}
