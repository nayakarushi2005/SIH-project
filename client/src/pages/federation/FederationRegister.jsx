import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import { useAuth } from '../../context/AuthContext';
import CityPinFields from '../../components/CityPinFields';
import { Building2, Users, Mail, IndianRupee, MapPin } from 'lucide-react';
import { Button, INPUT, LABEL, Notice, PageHeader, Panel, PanelHeader } from '../../components/ui';

const ICON = 'w-4 h-4 text-ink-3 absolute left-3 top-3 pointer-events-none';

export default function FederationRegister() {
  const navigate = useNavigate();
  const location = useLocation();
  const authFetch = useFetchWithAuth();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: user?.name || location.state?.user?.name || '',
    email: user?.email || location.state?.user?.email || '',
    area: '',
    city: '',
    pincode: '',
    amount: '',
    noOfWorkers: '',
  });

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: prev.name || user.name,
        email: prev.email || user.email
      }));
    }
  }, [user]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await authFetch('/api/federation/register', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          amount: Number(formData.amount) || 0,
          noOfWorkers: Number(formData.noOfWorkers) || 0,
          area: formData.area,
          city: formData.city.trim(),
          pincode: formData.pincode,
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.fields?.pincode || data.fields?.city || data.message || 'Failed to submit registration');
      }

      // Save details in DB -> Directly redirect to Federation Status page
      navigate('/federation/status', {
        state: { federation: data.federation },
      });
    } catch (err) {
      setError(err.message || 'Failed to submit registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Federation registration"
        description="Add your federation's details. A government official reviews them before you can accept workers."
      />

      <Panel className="max-w-3xl">
        <PanelHeader title="Federation details" description="Fields marked required must be filled in." />
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 px-5 py-6">
            {error && <Notice>{error}</Notice>}

            <div>
              <label htmlFor="name" className={LABEL}>
                Federation name <span className="text-ink-3 font-normal">(required)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter federation name"
                  className={`${INPUT} pl-9`}
                />
                <Building2 className={ICON} />
              </div>
            </div>

            <div>
              <label htmlFor="area" className={LABEL}>Area or region</label>
              <div className="relative">
                <input
                  type="text"
                  id="area"
                  name="area"
                  value={formData.area}
                  onChange={handleInputChange}
                  placeholder="e.g. Coastal District / State"
                  className={`${INPUT} pl-9`}
                />
                <MapPin className={ICON} />
              </div>
            </div>

            <CityPinFields
              city={formData.city}
              pincode={formData.pincode}
              onChange={(loc) => setFormData((prev) => ({ ...prev, ...loc }))}
            />

            <div>
              <label htmlFor="email" className={LABEL}>Official email</label>
              <div className="relative">
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  disabled
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`${INPUT} pl-9`}
                />
                <Mail className={ICON} />
              </div>
              <p className="mt-1.5 text-xs text-ink-3">Taken from the Google account you signed in with.</p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="amount" className={LABEL}>Fund amount (₹)</label>
                <div className="relative">
                  <input
                    type="number"
                    id="amount"
                    name="amount"
                    min="0"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="e.g. 50000"
                    className={`${INPUT} pl-9`}
                  />
                  <IndianRupee className={ICON} />
                </div>
              </div>

              <div>
                <label htmlFor="noOfWorkers" className={LABEL}>Number of workers</label>
                <div className="relative">
                  <input
                    type="number"
                    id="noOfWorkers"
                    name="noOfWorkers"
                    min="0"
                    value={formData.noOfWorkers}
                    onChange={handleInputChange}
                    placeholder="e.g. 100"
                    className={`${INPUT} pl-9`}
                  />
                  <Users className={ICON} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-3">Your details are saved and sent for government review.</p>
            <Button type="submit" disabled={loading}>
              {loading ? 'Submitting…' : 'Submit registration'}
            </Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
