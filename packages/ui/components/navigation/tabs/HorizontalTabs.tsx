import type { HorizontalTabItemProps } from "./HorizontalTabItem";
import HorizontalTabItem from "./HorizontalTabItem";

export interface NavTabProps {
  tabs: HorizontalTabItemProps[];
  linkProps?: HorizontalTabItemProps["linkProps"];
  actions?: JSX.Element;
}

const HorizontalTabs = function ({ tabs, linkProps, actions, ...props }: NavTabProps) {
  return (
    <div className="mb-4 h-9 max-w-[calc(100%+40px)] lg:mb-5">
      <nav
        className="no-scrollbar flex max-h-9 space-x-1 overflow-scroll rounded-md"
        aria-label="Tabs"
        {...props}>
        {tabs.map((tab, idx) => (
          <HorizontalTabItem className="px-4 py-2.5" {...tab} key={idx} {...linkProps} />
        ))}
      </nav>
      {actions && actions}
    </div>
  );
};

export default HorizontalTabs;
