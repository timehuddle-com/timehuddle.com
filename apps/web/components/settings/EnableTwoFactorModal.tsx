import type { BaseSyntheticEvent } from "react";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { ErrorCode } from "@calcom/features/auth/lib/ErrorCode";
import { useCallbackRef } from "@calcom/lib/hooks/useCallbackRef";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button, Dialog, DialogContent, DialogFooter, Form, TextField } from "@calcom/ui";

import TwoFactor from "@components/auth/TwoFactor";

import TwoFactorAuthAPI from "./TwoFactorAuthAPI";

interface EnableTwoFactorModalProps {
  open: boolean;
  onOpenChange: () => void;

  /**
   * Called when the user closes the modal without disabling two-factor auth
   */
  onCancel: () => void;

  /**
   * Called when the user enables two-factor auth
   */
  onEnable: () => void;
}

enum SetupStep {
  ConfirmPassword,
  DisplayQrCode,
  EnterTotpCode,
}

const WithStep = ({
  step,
  current,
  children,
}: {
  step: SetupStep;
  current: SetupStep;
  children: JSX.Element;
}) => {
  return step === current ? children : null;
};

interface EnableTwoFactorValues {
  totpCode: string;
}

const EnableTwoFactorModal = ({ onEnable, onCancel, open, onOpenChange }: EnableTwoFactorModalProps) => {
  const { t } = useLocale();
  const form = useForm<EnableTwoFactorValues>();

  const setupDescriptions = {
    [SetupStep.ConfirmPassword]: t("2fa_confirm_current_password"),
    [SetupStep.DisplayQrCode]: t("2fa_scan_image_or_use_code"),
    [SetupStep.EnterTotpCode]: t("2fa_enter_six_digit_code"),
  };
  const [step, setStep] = useState(SetupStep.ConfirmPassword);
  const [password, setPassword] = useState("");
  const [dataUri, setDataUri] = useState("");
  const [secret, setSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await TwoFactorAuthAPI.setup(password);
      const body = await response.json();

      if (response.status === 200) {
        setDataUri(body.dataUri);
        setSecret(body.secret);
        setStep(SetupStep.DisplayQrCode);
        return;
      }

      if (body.error === ErrorCode.IncorrectPassword) {
        setErrorMessage(t("incorrect_password"));
      } else {
        setErrorMessage(t("something_went_wrong"));
      }
    } catch (e) {
      setErrorMessage(t("something_went_wrong"));
      console.error(t("error_enabling_2fa"), e);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEnable({ totpCode }: EnableTwoFactorValues, e: BaseSyntheticEvent | undefined) {
    e?.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await TwoFactorAuthAPI.enable(totpCode);
      const body = await response.json();

      if (response.status === 200) {
        onEnable();
        return;
      }

      if (body.error === ErrorCode.IncorrectTwoFactorCode) {
        setErrorMessage(`${t("code_is_incorrect")} ${t("please_try_again")}`);
      } else {
        setErrorMessage(t("something_went_wrong"));
      }
    } catch (e) {
      setErrorMessage(t("something_went_wrong"));
      console.error(t("error_enabling_2fa"), e);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEnableRef = useCallbackRef(handleEnable);

  const totpCode = form.watch("totpCode");

  // auto submit 2FA if all inputs have a value
  useEffect(() => {
    if (totpCode?.trim().length === 6) {
      form.handleSubmit(handleEnableRef.current)();
    }
  }, [form, handleEnableRef, totpCode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("enable_2fa")} description={setupDescriptions[step]} type="creation">
        <WithStep step={SetupStep.ConfirmPassword} current={step}>
          <form onSubmit={handleSetup}>
            <div className="mb-4">
              <TextField
                label={t("password")}
                type="password"
                name="password"
                id="password"
                required
                value={password}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
              {errorMessage && <p className="mt-1 text-sm text-red-700">{errorMessage}</p>}
            </div>
          </form>
        </WithStep>
        <WithStep step={SetupStep.DisplayQrCode} current={step}>
          <>
            <div className="-mt-3 flex justify-center">
              {
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dataUri} alt="" />
              }
            </div>
            <p data-testid="two-factor-secret" className="mb-4 text-center font-mono text-xs">
              {secret}
            </p>
          </>
        </WithStep>
        <Form handleSubmit={handleEnable} form={form}>
          <WithStep step={SetupStep.EnterTotpCode} current={step}>
            <div className="-mt-4 pb-2">
              <TwoFactor center />

              {errorMessage && (
                <p data-testid="error-submitting-code" className="mt-1 text-sm text-red-700">
                  {errorMessage}
                </p>
              )}
            </div>
          </WithStep>
          <DialogFooter className="mt-8" showDivider>
            <Button color="secondary" onClick={onCancel}>
              {t("cancel")}
            </Button>
            <WithStep step={SetupStep.ConfirmPassword} current={step}>
              <Button
                type="submit"
                className="me-2 ms-2"
                onClick={handleSetup}
                disabled={password.length === 0 || isSubmitting}>
                {t("continue")}
              </Button>
            </WithStep>
            <WithStep step={SetupStep.DisplayQrCode} current={step}>
              <Button
                type="submit"
                data-testid="goto-otp-screen"
                className="me-2 ms-2"
                onClick={() => setStep(SetupStep.EnterTotpCode)}>
                {t("continue")}
              </Button>
            </WithStep>
            <WithStep step={SetupStep.EnterTotpCode} current={step}>
              <Button type="submit" className="me-2 ms-2" data-testid="enable-2fa" disabled={isSubmitting}>
                {t("enable")}
              </Button>
            </WithStep>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EnableTwoFactorModal;
