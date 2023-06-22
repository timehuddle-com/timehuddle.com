import classNames from "@calcom/lib/classNames";

export default function Logo({
  small,
  icon,
  inline = true,
  className,
}: {
  small?: boolean;
  icon?: boolean;
  inline?: boolean;
  className?: string;
}) {
  return (
    <h3 className={classNames("logo", inline && "inline", className)}>
      <strong>
        {icon ? (
          <img className="mx-auto w-9" alt="Logo" title="Logo" src="/api/logo?type=icon" />
        ) : (
          <img
            className={classNames(small ? "h-10 -mt-2 w-auto" : "-mt-4 w-auto")}
            alt="Logo"
            title="Logo"
            src="/api/logo"
          />
        )}
      </strong>
    </h3>
  );
}
