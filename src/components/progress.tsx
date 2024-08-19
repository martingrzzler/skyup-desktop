export function Progress({ label, value }: { label?: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <p className="">{label}</p>
        <p>{value}%</p>
      </div>
      <progress className="progress w-full" value={value} max={100} />
    </div>
  );
}
