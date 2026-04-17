import { useState, FormEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context';
import './login-page.css';

export function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const success = await login(email, password);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Invalid email or password. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Login error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setEmail(e.target.value);
    setError('');
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
    setError('');
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-brand">
            <span className="login-brand-icon">FE</span>
            <h1>Festival Planner</h1>
          </div>
          <p className="login-subtitle">Sign in to access your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="your.email@festival.local"
              required
              autoComplete="email"
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </div>

          <button type="submit" className="login-button" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-demo-info">
          <h3>Demo Credentials</h3>
          <ul>
            <li>
              <strong>Admin:</strong> alex.carter@festival.local / admin123
            </li>
            <li>
              <strong>Organizer:</strong> morgan.lee@festival.local / organizer123
            </li>
            <li>
              <strong>Coordinator:</strong> jordan.kim@festival.local / coordinator123
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
