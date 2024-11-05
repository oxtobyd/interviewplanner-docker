import React, { useState, useEffect } from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { Edit, Trash2 } from 'lucide-react'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase' // Ensure this path is correct for your project structure

interface Adviser {
  id: string
  title: string
  name: string
  email: string
  mobile: string  // New field for mobile phone
  biography: string
}

const Advisers: React.FC = () => {
  const [advisers, setAdvisers] = useState<Adviser[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const { register, handleSubmit, reset } = useForm<Adviser>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adviserToDelete, setAdviserToDelete] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'advisers'), (snapshot) => {
      const adviserData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Adviser))
      setAdvisers(adviserData)
    })

    return () => unsubscribe()
  }, [])

  const onSubmit: SubmitHandler<Adviser> = async (data) => {
    try {
      setLoading(true)
      setError(null)

      if (editingId) {
        const adviserRef = doc(db, 'advisers', editingId)
        const { id, ...updateData } = data
        await updateDoc(adviserRef, updateData)
        setEditingId(null)
      } else {
        await addDoc(collection(db, 'advisers'), data)
      }
      resetForm()
    } catch (err) {
      setError('An error occurred while saving the adviser')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const editAdviser = (adviser: Adviser) => {
    setEditingId(adviser.id)
    reset(adviser)
  }

  const deleteAdviser = (id: string) => {
    setAdviserToDelete(id);
  };

  const confirmDelete = async () => {
    if (adviserToDelete) {
      try {
        setLoading(true);
        setError(null);
        await deleteDoc(doc(db, 'advisers', adviserToDelete));
        setAdviserToDelete(null);
        resetForm()
      } catch (err) {
        setError('An error occurred while deleting the adviser');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const resetForm = () => {
    reset({
      title: '',
      name: '',
      email: '',
      mobile: '',
      biography: ''
    })
    setEditingId(null)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Advisers</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={handleSubmit(onSubmit)} className="mb-8 bg-white p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-12 gap-4">
            <input 
              {...register('title')} 
              placeholder="Title" 
              className="input col-span-2" 
              maxLength={25}
            />
            <input 
              {...register('name')} 
              placeholder="Name" 
              className="input col-span-4" 
            />
            <div className="grid grid-cols-2 gap-2 col-span-6">
              <input 
                {...register('email')} 
                placeholder="Email" 
                type="email" 
                className="input" 
              />
              <input 
                {...register('mobile')} 
                placeholder="Mobile" 
                className="input" 
              />
            </div>
          </div>
          <textarea 
            {...register('biography')} 
            placeholder="Biography" 
            className="input" 
            rows={6}
          />
        </div>
        <button type="submit" className="btn-primary mt-4" disabled={loading}>
          {editingId ? 'Update Adviser' : 'Add Adviser'}
        </button>
        {editingId && (
          <button type="button" onClick={resetForm} className="btn-secondary mt-4 ml-4">
            Cancel
          </button>
        )}
      </form>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {advisers.map((adviser) => (
              <tr key={adviser.id}>
                <td className="px-4 py-2 whitespace-nowrap">{adviser.title}</td>
                <td className="px-4 py-2 whitespace-nowrap">{adviser.name}</td>
                <td className="px-4 py-2 whitespace-nowrap">{adviser.email}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <button onClick={() => editAdviser(adviser)} className="text-blue-600 hover:text-blue-900 mr-2">
                    <Edit className="h-5 w-5" />
                  </button>
                  <button onClick={() => deleteAdviser(adviser.id)} className="text-red-600 hover:text-red-900">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adviserToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Delete Adviser</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this adviser? This action cannot be undone.
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  Delete
                </button>
                <button
                  onClick={() => setAdviserToDelete(null)}
                  className="mt-3 px-4 py-2 bg-white text-gray-800 text-base font-medium rounded-md w-full shadow-sm border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Advisers
