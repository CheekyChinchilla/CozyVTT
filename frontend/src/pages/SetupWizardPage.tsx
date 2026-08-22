// ============================================
// Setup Wizard Page
// First-time setup for CozyVTT installation
// Multi-step wizard with form validation
// ============================================

import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Settings, CheckCircle, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { setupService } from '@/services/setup.service';
import { useAuth } from '@/contexts/AuthContext';
import {
  isValidEmail,
  isStrongPassword,
  getPasswordStrength,
} from '@/utils/validation';
import Button from '@/components/ui/Button';

// ============================================
// Types
// ============================================

interface AdminAccountData {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

interface SystemConfigData {
  instanceName: string;
  timezone: string;
  enableRegistration: boolean;
}

// ============================================
// Main Component
// ============================================

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { mascotUrl } = useTheme();

  // Step management
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // Form data
  const [adminData, setAdminData] = useState<AdminAccountData>({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });

  const [systemConfig, setSystemConfig] = useState<SystemConfigData>({
    instanceName: 'CozyVTT',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    enableRegistration: false,
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Guard: the wizard is only for a brand-new install. If setup is already
  // complete (an existing install or a container update), never show the form —
  // bounce to the landing page. POST /api/setup/init also rejects
  // re-initialization server-side; this keeps the URL from exposing the wizard.
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setupService.checkSetupStatus()
      .then((status) => {
        if (cancelled) return;
        if (!status.needsSetup) {
          navigate('/', { replace: true });
        } else {
          setCheckingStatus(false);
        }
      })
      // On a failed check, allow the wizard through — the backend still guards
      // against double-initialization, so this can't corrupt an existing install.
      .catch(() => { if (!cancelled) setCheckingStatus(false); });
    return () => { cancelled = true; };
  }, [navigate]);

  // Password strength
  const passwordStrength = adminData.password
    ? getPasswordStrength(adminData.password)
    : null;

  // ============================================
  // Validation
  // ============================================

  const validateStep2 = (): boolean => {
    const errors: Record<string, string> = {};

    // Display name
    if (!adminData.displayName) {
      errors.displayName = 'Display name is required';
    } else if (adminData.displayName.length < 2) {
      errors.displayName = 'Display name must be at least 2 characters';
    }

    // Email
    if (!adminData.email) {
      errors.email = 'Email is required';
    } else if (!isValidEmail(adminData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Password
    if (!adminData.password) {
      errors.password = 'Password is required';
    } else if (!isStrongPassword(adminData.password)) {
      errors.password =
        'Password must be at least 12 characters with uppercase, lowercase, number, and special character';
    }

    // Confirm password
    if (!adminData.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (adminData.password !== adminData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep3 = (): boolean => {
    const errors: Record<string, string> = {};

    if (!systemConfig.instanceName) {
      errors.instanceName = 'Instance name is required';
    } else if (systemConfig.instanceName.length < 2) {
      errors.instanceName = 'Instance name must be at least 2 characters';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ============================================
  // Navigation
  // ============================================

  const handleNext = () => {
    setError(null);
    setFieldErrors({});

    // Validate current step
    if (currentStep === 2 && !validateStep2()) {
      return;
    }
    if (currentStep === 3 && !validateStep3()) {
      return;
    }

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    setError(null);
    setFieldErrors({});
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // ============================================
  // Submit
  // ============================================

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Call setup initialization endpoint
      await setupService.initializeSetup({
        email: adminData.email,
        password: adminData.password,
        displayName: adminData.displayName,
      });

      // Refresh auth context to get the new admin user
      await refreshUser();

      // Redirect to dashboard
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Setup error:', err);

      if (err.response?.data?.error) {
        setError(err.response.data.message || err.response.data.error);
      } else if (err.response?.status === 400) {
        setError('Setup has already been completed');
      } else {
        setError('An error occurred during setup. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // Render Steps
  // ============================================

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1Welcome />;
      case 2:
        return (
          <Step2AdminAccount
            data={adminData}
            setData={setAdminData}
            fieldErrors={fieldErrors}
            passwordStrength={passwordStrength}
          />
        );
      case 3:
        return (
          <Step3SystemConfig
            data={systemConfig}
            setData={setSystemConfig}
            fieldErrors={fieldErrors}
          />
        );
      case 4:
        return <Step4Review adminData={adminData} systemConfig={systemConfig} />;
      default:
        return null;
    }
  };

  // ============================================
  // Main Render
  // ============================================

  // Don't flash the wizard while we confirm this is actually a fresh install.
  if (checkingStatus) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20"
        aria-live="polite"
        aria-label="Checking setup status"
      >
        <Loader2 className="w-8 h-8 text-brand-ink animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 px-4 py-8">
      <div className="glass-panel max-w-3xl w-full p-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img src={mascotUrl} alt="CozyVTT" className="w-20 h-20 object-contain animate-pulse-soft" />
          </div>
          <h1 className="text-4xl font-bold text-brand-ink font-heading">
            CozyVTT Setup
          </h1>
          <p className="mt-2 text-warm-gray">
            Let's get your Virtual Tabletop ready
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`h-2 rounded-full transition-all ${
                step === currentStep
                  ? 'w-12 bg-warm-amber'
                  : step < currentStep
                  ? 'w-8 bg-moss-green'
                  : 'w-8 bg-warm-gray/20'
              }`}
            />
          ))}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-spirit-red/10 border border-spirit-red/30 rounded-lg p-4">
            <p className="text-sm text-spirit-red font-medium">{error}</p>
          </div>
        )}

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-warm-gray/20">
          <Button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 1 || loading}
            variant="secondary" className={`flex items-center gap-2 ${
            currentStep === 1 ? 'invisible' : ''
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          {currentStep < totalSteps ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="inline">
              <Button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Completing Setup...
                  </>
                ) : (
                  <>
                    Complete Setup
                    <CheckCircle className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Step 1: Welcome
// ============================================

function Step1Welcome() {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center gap-4">
        <Shield className="w-12 h-12 text-spirit-purple" />
        <Settings className="w-12 h-12 text-brand-ink" />
      </div>

      <div>
        <h2 className="text-2xl font-bold text-brand-ink mb-3">
          Welcome to CozyVTT!
        </h2>
        <p className="text-stone-gray max-w-xl mx-auto">
          This wizard will guide you through setting up your self-hosted Virtual
          Tabletop for cozy, narrative-driven campaigns.
        </p>
      </div>

      <div className="glass-panel p-6 text-left space-y-4 bg-warm-amber/5">
        <h3 className="font-semibold text-brand-ink">What we'll set up:</h3>
        <ul className="space-y-2 text-sm text-stone-gray">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-brand-ink flex-shrink-0 mt-0.5" />
            <span>Create your administrator account</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-brand-ink flex-shrink-0 mt-0.5" />
            <span>Configure basic system settings</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-brand-ink flex-shrink-0 mt-0.5" />
            <span>Complete the installation process</span>
          </li>
        </ul>
      </div>

      <p className="text-sm text-warm-gray">
        This process takes about 2 minutes. Click Next to begin.
      </p>
    </div>
  );
}

// ============================================
// Step 2: Admin Account
// ============================================

interface Step2Props {
  data: AdminAccountData;
  setData: (data: AdminAccountData) => void;
  fieldErrors: Record<string, string>;
  passwordStrength: { score: number; label: string; color: string } | null;
}

function Step2AdminAccount({ data, setData, fieldErrors, passwordStrength }: Step2Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-brand-ink mb-2">
          Create Admin Account
        </h2>
        <p className="text-sm text-stone-gray">
          This account will have full system access
        </p>
      </div>

      <div className="space-y-4">
        {/* Display Name */}
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-brand-ink mb-1">
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={data.displayName}
            onChange={(e) => setData({ ...data, displayName: e.target.value })}
            className={`input-cozy w-full ${
              fieldErrors.displayName ? 'border-spirit-red' : ''
            }`}
            placeholder="Your name"
            maxLength={50}
          />
          {fieldErrors.displayName && (
            <p className="mt-1 text-xs text-spirit-red">{fieldErrors.displayName}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-brand-ink mb-1">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={data.email}
            onChange={(e) => setData({ ...data, email: e.target.value })}
            className={`input-cozy w-full ${
              fieldErrors.email ? 'border-spirit-red' : ''
            }`}
            placeholder="admin@example.com"
          />
          {fieldErrors.email && (
            <p className="mt-1 text-xs text-spirit-red">{fieldErrors.email}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-brand-ink mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={data.password}
            onChange={(e) => setData({ ...data, password: e.target.value })}
            className={`input-cozy w-full ${
              fieldErrors.password ? 'border-spirit-red' : ''
            }`}
            placeholder="At least 12 characters"
          />
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-spirit-red">{fieldErrors.password}</p>
          )}

          {/* Password Strength Indicator */}
          {data.password && passwordStrength && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-warm-gray">Password Strength:</span>
                <span
                  className={`text-xs font-medium ${
                    passwordStrength.color === 'green'
                      ? 'text-success-ink'
                      : passwordStrength.color === 'yellow'
                      ? 'text-warning-ink'
                      : 'text-danger-ink'
                  }`}
                >
                  {passwordStrength.label}
                </span>
              </div>
              <div className="w-full bg-warm-gray/20 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    passwordStrength.color === 'green'
                      ? 'bg-success'
                      : passwordStrength.color === 'yellow'
                      ? 'bg-warning'
                      : 'bg-danger'
                  }`}
                  style={{ width: `${(passwordStrength.score / 10) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-brand-ink mb-1"
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={data.confirmPassword}
            onChange={(e) => setData({ ...data, confirmPassword: e.target.value })}
            className={`input-cozy w-full ${
              fieldErrors.confirmPassword ? 'border-spirit-red' : ''
            }`}
            placeholder="Re-enter your password"
          />
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-xs text-spirit-red">{fieldErrors.confirmPassword}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Step 3: System Configuration
// ============================================

interface Step3Props {
  data: SystemConfigData;
  setData: (data: SystemConfigData) => void;
  fieldErrors: Record<string, string>;
}

function Step3SystemConfig({ data, setData, fieldErrors }: Step3Props) {
  // Get common timezones
  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
    'UTC',
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-brand-ink mb-2">
          System Configuration
        </h2>
        <p className="text-sm text-stone-gray">
          Customize your CozyVTT instance
        </p>
      </div>

      <div className="space-y-4">
        {/* Instance Name */}
        <div>
          <label
            htmlFor="instanceName"
            className="block text-sm font-medium text-brand-ink mb-1"
          >
            Instance Name
          </label>
          <input
            id="instanceName"
            type="text"
            value={data.instanceName}
            onChange={(e) => setData({ ...data, instanceName: e.target.value })}
            className={`input-cozy w-full ${
              fieldErrors.instanceName ? 'border-spirit-red' : ''
            }`}
            placeholder="CozyVTT"
          />
          <p className="mt-1 text-xs text-warm-gray">
            This will appear in the browser tab and page titles
          </p>
          {fieldErrors.instanceName && (
            <p className="mt-1 text-xs text-spirit-red">{fieldErrors.instanceName}</p>
          )}
        </div>

        {/* Timezone */}
        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-brand-ink mb-1">
            Timezone
          </label>
          <select
            id="timezone"
            value={data.timezone}
            onChange={(e) => setData({ ...data, timezone: e.target.value })}
            className="input-cozy w-full"
          >
            <option value={data.timezone}>{data.timezone} (Detected)</option>
            <optgroup label="Common Timezones">
              {timezones
                .filter((tz) => tz !== data.timezone)
                .map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
            </optgroup>
          </select>
          <p className="mt-1 text-xs text-warm-gray">
            Used for scheduling and timestamps
          </p>
        </div>

        {/* Enable Registration */}
        <div className="glass-panel p-4 bg-warm-amber/5">
          <div className="flex items-start gap-3">
            <input
              id="enableRegistration"
              type="checkbox"
              checked={data.enableRegistration}
              onChange={(e) =>
                setData({ ...data, enableRegistration: e.target.checked })
              }
              className="mt-1 h-4 w-4 text-warm-amber focus:ring-warm-amber border-warm-gray/30 rounded"
            />
            <div className="flex-1">
              <label
                htmlFor="enableRegistration"
                className="block text-sm font-medium text-brand-ink cursor-pointer"
              >
                Enable Public Registration
              </label>
              <p className="mt-1 text-xs text-stone-gray">
                Allow anyone to create an account on this instance. You can change this
                later in system settings.
              </p>
              <p className="mt-2 text-xs text-warm-amber font-medium">
                ⚠️ Recommended: Keep this disabled for private instances
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Step 4: Review
// ============================================

interface Step4Props {
  adminData: AdminAccountData;
  systemConfig: SystemConfigData;
}

function Step4Review({ adminData, systemConfig }: Step4Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-brand-ink mb-2">
          Review & Confirm
        </h2>
        <p className="text-sm text-stone-gray">
          Please review your configuration before completing setup
        </p>
      </div>

      <div className="space-y-4">
        {/* Admin Account */}
        <div className="glass-panel p-4 bg-moss-green/5">
          <h3 className="font-semibold text-brand-ink mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Administrator Account
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-warm-gray">Display Name:</dt>
              <dd className="text-brand-ink font-medium">{adminData.displayName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-warm-gray">Email:</dt>
              <dd className="text-brand-ink font-medium">{adminData.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-warm-gray">Password:</dt>
              <dd className="text-stone-gray">••••••••••••</dd>
            </div>
          </dl>
        </div>

        {/* System Configuration */}
        <div className="glass-panel p-4 bg-warm-amber/5">
          <h3 className="font-semibold text-brand-ink mb-3 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            System Configuration
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-warm-gray">Instance Name:</dt>
              <dd className="text-brand-ink font-medium">{systemConfig.instanceName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-warm-gray">Timezone:</dt>
              <dd className="text-brand-ink font-medium">{systemConfig.timezone}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-warm-gray">Public Registration:</dt>
              <dd
                className={`font-medium ${
                  systemConfig.enableRegistration ? 'text-warm-amber' : 'text-stone-gray'
                }`}
              >
                {systemConfig.enableRegistration ? 'Enabled' : 'Disabled'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Confirmation Message */}
        <div className="glass-panel p-4 border-2 border-moss-green/30">
          <p className="text-sm text-stone-gray text-center">
            Click <span className="font-medium text-brand-ink">Complete Setup</span> to
            create your admin account and finish the installation. You will be
            automatically logged in and redirected to the dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
