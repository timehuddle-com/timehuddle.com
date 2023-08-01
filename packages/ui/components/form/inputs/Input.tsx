import type { ReactElement, ReactNode, Ref } from "react";
import React, { forwardRef, useCallback, useId, useState } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";
import { FormProvider, useFormContext } from "react-hook-form";

import classNames from "@calcom/lib/classNames";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { useLocale } from "@calcom/lib/hooks/useLocale";

import { Alert, showToast, Skeleton, Tooltip, UnstyledSelect } from "../../..";
import { Eye, EyeOff, X, Search } from "../../icon";
import { HintsOrErrors } from "./HintOrErrors";
import { Label } from "./Label";

type InputProps = JSX.IntrinsicElements["input"] & { isFullWidth?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { isFullWidth = true, ...props },
  ref
) {
  return (
    <input
      {...props}
      ref={ref}
      className={classNames(
        "hover:border-emphasis dark:focus:border-emphasis border-default bg-default placeholder:text-muted text-emphasis disabled:hover:border-default disabled:bg-subtle focus:ring-brand-default mb-2 block h-9 rounded-md border px-3 py-2 text-sm leading-4 focus:border-neutral-300 focus:outline-none focus:ring-2 disabled:cursor-not-allowed",
        isFullWidth && "w-full",
        props.className
      )}
    />
  );
});

export function InputLeading(props: JSX.IntrinsicElements["div"]) {
  return (
    <span className="bg-muted border-default text-subtle inline-flex flex-shrink-0 items-center rounded-l-sm border px-3 ltr:border-r-0 rtl:border-l-0 sm:text-sm sm:leading-4">
      {props.children}
    </span>
  );
}

type InputFieldProps = {
  label?: ReactNode;
  LockedIcon?: React.ReactNode;
  hint?: ReactNode;
  hintErrors?: string[];
  addOnLeading?: ReactNode;
  addOnSuffix?: ReactNode;
  inputIsFullWidth?: boolean;
  addOnFilled?: boolean;
  addOnClassname?: string;
  error?: string;
  labelSrOnly?: boolean;
  containerClassName?: string;
  showAsteriskIndicator?: boolean;
  t?: (key: string) => string;
} & React.ComponentProps<typeof Input> & {
    labelProps?: React.ComponentProps<typeof Label>;
    labelClassName?: string;
  };

type AddonProps = {
  children: React.ReactNode;
  isFilled?: boolean;
  className?: string;
  error?: boolean;
};

const Addon = ({ isFilled, children, className, error }: AddonProps) => (
  <div
    className={classNames(
      "addon-wrapper border-default [input:hover_+_&]:border-emphasis [input:hover_+_&]:border-l-default [&:has(+_input:hover)]:border-emphasis [&:has(+_input:hover)]:border-r-default h-9 border px-3",
      isFilled && "bg-subtle",
      className
    )}>
    <div
      className={classNames(
        "min-h-9 flex flex-col justify-center text-sm leading-7",
        error ? "text-error" : "text-default"
      )}>
      <span className="flex whitespace-nowrap">{children}</span>
    </div>
  </div>
);

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(props, ref) {
  const id = useId();
  const { t: _t, isLocaleReady, i18n } = useLocale();
  const t = props.t || _t;
  const name = props.name || "";
  const {
    label = t(name),
    labelProps,
    labelClassName,
    disabled,
    LockedIcon,
    placeholder = isLocaleReady && i18n.exists(name + "_placeholder") ? t(name + "_placeholder") : "",
    className,
    addOnLeading,
    addOnSuffix,
    addOnFilled = true,
    addOnClassname,
    inputIsFullWidth,
    hint,
    type,
    hintErrors,
    labelSrOnly,
    containerClassName,
    readOnly,
    showAsteriskIndicator,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    t: __t,
    ...passThrough
  } = props;

  const [inputValue, setInputValue] = useState<string>("");

  return (
    <div className={classNames(containerClassName)}>
      {!!name && (
        <Skeleton
          as={Label}
          htmlFor={id}
          loadingClassName="w-16"
          {...labelProps}
          className={classNames(labelClassName, labelSrOnly && "sr-only", props.error && "text-error")}>
          {label}
          {showAsteriskIndicator && !readOnly && passThrough.required ? (
            <span className="text-default ml-1 font-medium">*</span>
          ) : null}
          {LockedIcon}
        </Skeleton>
      )}
      {addOnLeading || addOnSuffix ? (
        <div
          dir="ltr"
          className="focus-within:ring-brand-default group relative mb-1 flex items-center rounded-md focus-within:outline-none focus-within:ring-2">
          {addOnLeading && (
            <Addon isFilled={addOnFilled} className={classNames("rounded-l-md border-r-0", addOnClassname)}>
              {addOnLeading}
            </Addon>
          )}
          <Input
            id={id}
            type={type}
            placeholder={placeholder}
            isFullWidth={inputIsFullWidth}
            className={classNames(
              className,
              "disabled:bg-subtle disabled:hover:border-subtle disabled:cursor-not-allowed",
              addOnLeading && "rounded-l-none border-l-0",
              addOnSuffix && "rounded-r-none border-r-0",
              type === "search" && "pr-8",
              "!my-0 !ring-0"
            )}
            {...passThrough}
            {...(type == "search" && {
              onChange: (e) => {
                setInputValue(e.target.value);
                props.onChange && props.onChange(e);
              },
              value: inputValue,
            })}
            disabled={readOnly || disabled}
            ref={ref}
          />
          {addOnSuffix && (
            <Addon
              isFilled={addOnFilled}
              className={classNames("ltr:rounded-r-md rtl:rounded-l-md", addOnClassname)}>
              {addOnSuffix}
            </Addon>
          )}
          {type === "search" && inputValue?.toString().length > 0 && (
            <X
              className="text-subtle absolute top-2.5 h-4 w-4 cursor-pointer ltr:right-2 rtl:left-2"
              onClick={(e) => {
                setInputValue("");
                props.onChange && props.onChange(e as unknown as React.ChangeEvent<HTMLInputElement>);
              }}
            />
          )}
        </div>
      ) : (
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          className={classNames(
            className,
            "disabled:bg-subtle disabled:hover:border-subtle disabled:cursor-not-allowed"
          )}
          {...passThrough}
          readOnly={readOnly}
          ref={ref}
          isFullWidth={inputIsFullWidth}
          disabled={readOnly || disabled}
        />
      )}
      <HintsOrErrors hintErrors={hintErrors} fieldName={name} t={t} />
      {hint && <div className="text-default mt-2 flex items-center text-sm">{hint}</div>}
    </div>
  );
});

export const TextField = forwardRef<HTMLInputElement, InputFieldProps>(function TextField(props, ref) {
  return <InputField ref={ref} {...props} />;
});

export const PasswordField = forwardRef<HTMLInputElement, InputFieldProps>(function PasswordField(
  props,
  ref
) {
  const { t } = useLocale();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const toggleIsPasswordVisible = useCallback(
    () => setIsPasswordVisible(!isPasswordVisible),
    [isPasswordVisible, setIsPasswordVisible]
  );
  const textLabel = isPasswordVisible ? t("hide_password") : t("show_password");

  return (
    <div className="[&_.group:hover_.addon-wrapper]:border-emphasis relative [&_.group:focus-within_.addon-wrapper]:border-neutral-300">
      <InputField
        type={isPasswordVisible ? "text" : "password"}
        placeholder={props.placeholder || "•••••••••••••"}
        ref={ref}
        {...props}
        className={classNames(
          "addon-wrapper mb-0 ltr:border-r-0 ltr:pr-10 rtl:border-l-0 rtl:pl-10",
          props.className
        )}
        addOnFilled={false}
        addOnSuffix={
          <Tooltip content={textLabel}>
            <button className="text-emphasis h-9" type="button" onClick={() => toggleIsPasswordVisible()}>
              {isPasswordVisible ? (
                <EyeOff className="h-4 stroke-[2.5px]" />
              ) : (
                <Eye className="h-4 stroke-[2.5px]" />
              )}
              <span className="sr-only">{textLabel}</span>
            </button>
          </Tooltip>
        }
      />
    </div>
  );
});

export const EmailInput = forwardRef<HTMLInputElement, InputFieldProps>(function EmailInput(props, ref) {
  return (
    <Input
      ref={ref}
      type="email"
      autoCapitalize="none"
      autoComplete="email"
      autoCorrect="off"
      inputMode="email"
      {...props}
    />
  );
});

export const EmailField = forwardRef<HTMLInputElement, InputFieldProps>(function EmailField(props, ref) {
  return (
    <InputField
      ref={ref}
      type="email"
      autoCapitalize="none"
      autoComplete="email"
      autoCorrect="off"
      inputMode="email"
      {...props}
    />
  );
});

type TextAreaProps = JSX.IntrinsicElements["textarea"];

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextAreaInput(props, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={classNames(
        "hover:border-emphasis border-default bg-default placeholder:text-muted text-emphasis disabled:hover:border-default disabled:bg-subtle focus:ring-brand-default mb-2 block w-full rounded-md border px-3 py-2 text-sm focus:border-neutral-300 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed",
        props.className
      )}
    />
  );
});

type TextAreaFieldProps = {
  label?: ReactNode;
  t?: (key: string) => string;
} & React.ComponentProps<typeof TextArea> & {
    name: string;
    labelProps?: React.ComponentProps<typeof Label>;
  };

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextField(
  props,
  ref
) {
  const id = useId();
  const { t: _t } = useLocale();
  const t = props.t || _t;
  const methods = useFormContext();
  const {
    label = t(props.name as string),
    labelProps,
    /** Prevents displaying untranslated placeholder keys */
    placeholder = t(props.name + "_placeholder") !== props.name + "_placeholder"
      ? t(props.name + "_placeholder")
      : "",
    ...passThrough
  } = props;
  return (
    <div>
      {!!props.name && (
        <Label htmlFor={id} {...labelProps}>
          {label}
        </Label>
      )}
      <TextArea ref={ref} placeholder={placeholder} {...passThrough} />
      {methods?.formState?.errors[props.name]?.message && (
        <Alert
          className="mt-1"
          severity="error"
          message={<>{methods.formState.errors[props.name]?.message}</>}
        />
      )}
    </div>
  );
});

type FormProps<T extends object> = { form: UseFormReturn<T>; handleSubmit: SubmitHandler<T> } & Omit<
  JSX.IntrinsicElements["form"],
  "onSubmit"
>;

const PlainForm = <T extends FieldValues>(props: FormProps<T>, ref: Ref<HTMLFormElement>) => {
  const { form, handleSubmit, ...passThrough } = props;

  return (
    <FormProvider {...form}>
      <form
        ref={ref}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();

          form
            .handleSubmit(handleSubmit)(event)
            .catch((err) => {
              // FIXME: Booking Pages don't have toast, so this error is never shown
              showToast(`${getErrorFromUnknown(err).message}`, "error");
            });
        }}
        {...passThrough}>
        {props.children}
      </form>
    </FormProvider>
  );
};

export const Form = forwardRef(PlainForm) as <T extends FieldValues>(
  p: FormProps<T> & { ref?: Ref<HTMLFormElement> }
) => ReactElement;

export function FieldsetLegend(props: JSX.IntrinsicElements["legend"]) {
  return (
    <legend {...props} className={classNames("text-default text-sm font-medium leading-4", props.className)}>
      {props.children}
    </legend>
  );
}

export function InputGroupBox(props: JSX.IntrinsicElements["div"]) {
  return (
    <div
      {...props}
      className={classNames("bg-default border-default space-y-2 rounded-sm border p-2", props.className)}>
      {props.children}
    </div>
  );
}

export const InputFieldWithSelect = forwardRef<
  HTMLInputElement,
  InputFieldProps & { selectProps: typeof UnstyledSelect }
>(function EmailField(props, ref) {
  return (
    <InputField
      ref={ref}
      {...props}
      inputIsFullWidth={false}
      addOnClassname="!px-0"
      addOnSuffix={<UnstyledSelect {...props.selectProps} />}
    />
  );
});

export const NumberInput = forwardRef<HTMLInputElement, InputFieldProps>(function NumberInput(props, ref) {
  return (
    <Input
      ref={ref}
      type="number"
      autoCapitalize="none"
      autoComplete="numeric"
      autoCorrect="off"
      inputMode="numeric"
      {...props}
    />
  );
});

export const FilterSearchField = forwardRef<HTMLInputElement, InputFieldProps>(function TextField(
  props,
  ref
) {
  return (
    <div
      dir="ltr"
      className="focus-within:ring-brand-default group relative mx-3 mb-1 mt-2.5 flex items-center rounded-md focus-within:outline-none focus-within:ring-2">
      <div className="addon-wrapper border-default [input:hover_+_&]:border-emphasis [input:hover_+_&]:border-l-default [&:has(+_input:hover)]:border-emphasis [&:has(+_input:hover)]:border-r-default flex h-7 items-center justify-center rounded-l-md border border-r-0">
        <Search className="ms-3 h-4 w-4" />
      </div>
      <Input
        ref={ref}
        className="disabled:bg-subtle disabled:hover:border-subtle !my-0 h-7 rounded-l-none border-l-0 !ring-0 disabled:cursor-not-allowed"
        {...props}
      />
    </div>
  );
});
