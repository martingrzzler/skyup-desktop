import classNames from "classnames";

export function Text({
  children,
  ringColor = "gray",
  className,
}: {
  children: string;
  ringColor?: "red" | "green" | "gray";
  className?: string;
}) {
  return (
    <p
      className={classNames(
        "text-sm mt-4 rounded p-2 ring-1 ring-gray-300 max-w-fit",
        {
          "ring-red-300": ringColor === "red",
          "ring-gray-300": ringColor === "gray",
          "ring-green-300": ringColor === "green",
        },
        className
      )}
    >
      {children}
    </p>
  );
}
