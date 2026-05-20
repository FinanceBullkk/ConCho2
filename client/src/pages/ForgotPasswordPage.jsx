import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { forgotPasswordSchema } from '../lib/validations';
import api from '../api/api';
import { Button } from '@/components/ui/button';
import { FormField, FormLabel, FormInput, FormError } from '@/components/ui/form';
import { Spinner } from '../components/Spinner';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const methods = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { empCode: '' },
  });
  const { handleSubmit, formState: { isSubmitting } } = methods;

  const onSubmit = handleSubmit(async ({ empCode }) => {
    try {
      await api.post('/auth/forgot-password', { empCode });
      setSent(true);
    } catch {
      // Always show success to avoid enumeration — errors handled silently
      setSent(true);
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        {/* Wordmark — matches LoginPage v2 / Phase 3 Screen 7 */}
        <div className="text-center mb-8">
          <h1 className="text-[2.5rem] font-bold tracking-tight text-foreground leading-none">
            TMS<span className="text-primary">.</span>
          </h1>
          <p className="text-muted-foreground mt-2">Hệ thống Quản lý Đào tạo</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center size-12 rounded-lg bg-success/10 border border-success/20 mb-2">
                <Mail className="size-6 text-success" aria-hidden="true" />
              </div>
              <h2 className="text-h3 text-foreground">Kiểm tra email của bạn</h2>
              <p className="text-body text-muted-foreground">
                Nếu mã nhân viên tồn tại và có email đăng ký, liên kết đặt lại đã được gửi. Vui lòng kiểm tra hộp thư (và mục spam).
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 mt-4 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Quay lại đăng nhập
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-h3 text-foreground mb-2">Quên mật khẩu?</h2>
              <p className="text-body text-muted-foreground mb-6">
                Nhập mã nhân viên của bạn và chúng tôi sẽ gửi liên kết đặt lại tới email đã đăng ký.
              </p>

              <FormProvider {...methods}>
                <form onSubmit={onSubmit} noValidate>
                  <FormField name="empCode" className="mb-5">
                    <FormLabel>Mã nhân viên</FormLabel>
                    <FormInput
                      type="text"
                      placeholder="vd: 000001"
                      autoFocus  // eslint-disable-line jsx-a11y/no-autofocus
                      className="h-12"
                    />
                    <FormError />
                  </FormField>

                  <Button type="submit" className="w-full h-12" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <><Spinner size={16} />Đang gửi…</>
                    ) : 'Gửi liên kết đặt lại'}
                  </Button>

                  <div className="mt-4 text-center">
                    <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      Quay lại đăng nhập
                    </Link>
                  </div>
                </form>
              </FormProvider>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
