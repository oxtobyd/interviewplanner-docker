import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useForm, SubmitHandler, Controller } from 'react-hook-form'
import { Edit, Trash2, Upload, Download } from 'lucide-react'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query } from 'firebase/firestore'
import { db, storage } from '../firebase'
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Don't forget to import Quill styles
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import Quill from 'quill';

// Add this before your component
const Font = Quill.import('formats/font');
Font.whitelist = ['Arial', 'Helvetica', 'Times New Roman', 'Courier'];
Quill.register(Font, true);

interface Template {
  id: string
  name: string
  content: string
  type: 'adviser_email' | 'candidate_letter' | 'panel_document'
  category: string
  generalCategory: ''| 'Selection Qualities' | 'Selection Criteria' | 'Formation Qualities' | 'Formation Criteria' | 'Answer the Question'
  wordTemplateUrl?: string
}

const candidateFields = [
  'surname', 'forename', 'email', 'questionCategory',
  'diocese', 'sponsoringBishop', 'ddoName', 'ddoEmail', 'revisedQuestion'
]

const interviewFields = [
  'adviserNames', 'category', 'panelDate', 
  'leadAdviserName', 'leadAdviser.title', 'leadAdviser.email', 'leadAdviser.mobile', 'leadAdviser.biography',
  '2ndleadAdviserName', '2ndleadAdviser.title', '2ndleadAdviser.email', '2ndleadAdviser.mobile', '2ndleadAdviser.biography',
  'otherAdviserName', 'otherAdviser.title', 'otherAdviser.biography',
  '2ndotherAdviserName', '2ndotherAdviser.title', '2ndotherAdviser.biography'
]

const ndaFields = [
  'title', 'name', 'email'
]

const Templates: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const { control, handleSubmit, reset, setValue, watch } = useForm<Template>()
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const [questionCategories, setQuestionCategories] = useState<{ id: string; category: string }[]>([]);
  const [quillContent, setQuillContent] = useState('');
  const quillRef = useRef<ReactQuill>(null);
  //const [ndas, setNDAs] = useState<{ id: string; title: string; name: string; email: string }[]>([]);

  const [wordFile, setWordFile] = useState<File | null>(null);
  const wordFileInputRef = useRef<HTMLInputElement>(null);

  //const content = watch('content')

  const [existingWordFile, setExistingWordFile] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'templates'), (snapshot) => {
      const templateData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Template))
      setTemplates(templateData)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const fetchQuestionCategories = async () => {
      const q = query(collection(db, 'questionCategories'));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const categories = querySnapshot.docs.map(doc => ({
          id: doc.id,
          category: doc.data().category
        }));
        // Sort the categories alphabetically
        categories.sort((a, b) => a.category.localeCompare(b.category));
        setQuestionCategories(categories);
      });

      return () => unsubscribe();
    };

    fetchQuestionCategories();
  }, []);

  //useEffect(() => {
  //  const unsubscribe = onSnapshot(collection(db, 'ndas'), (snapshot) => {
  //    const ndasData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as { title: string; name: string; email: string } }));
  //    setNDAs(ndasData);
  //  });

  //  return () => unsubscribe();
  //}, []);

  // Updated sorting logic
  const sortedTemplates = useMemo(() => {
    return [...templates].sort((a, b) => {
      // First, sort by category
      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
      
      // If categories are the same, sort by name
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      
      // If names are the same, sort by type
      if (a.type < b.type) return -1;
      if (a.type > b.type) return 1;
      
      return 0;
    });
  }, [templates]);

  const insertPlaceholder = (field: string) => {
    if (watch('type') === 'adviser_email') {
      const textarea = contentRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const text = textarea.value
        const before = text.substring(0, start)
        const after = text.substring(end, text.length)
        const newContent = `${before}{{${field}}}${after}`
        setValue('content', newContent, { shouldValidate: true })
        
        // Set cursor position after inserted placeholder
        setTimeout(() => {
          textarea.focus()
          textarea.setSelectionRange(start + field.length + 4, start + field.length + 4)
        }, 0)
      }
    } else if (watch('type') === 'candidate_letter' && quillRef.current) {
      const editor = quillRef.current.getEditor();
      const range = editor.getSelection(true);
      if (range) {
        editor.insertText(range.index, `{{${field}}}`, 'user');
        editor.setSelection(range.index + field.length + 4, 0);
      }
    }
  }

  const onSubmit: SubmitHandler<Template> = async (data) => {
    try {
      if (data.type === 'candidate_letter') {
        data.content = quillContent;
      }
  
      let wordTemplateUrl = existingWordFile;
  
      if (wordFile) {
        const storageRef = ref(storage, `wordTemplates/${data.name}_${Date.now()}.docx`);
        await uploadBytes(storageRef, wordFile);
        wordTemplateUrl = await getDownloadURL(storageRef);
      }
  
      const templateData = {
        ...data,
        wordTemplateUrl
      };
  
      if (editingId) {
        await updateDoc(doc(db, 'templates', editingId), templateData);
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'templates'), templateData);
      }
  
      // Clear the form after successful submission
      reset({
        name: '',
        content: '',
        type: 'adviser_email',
        category: '',
        generalCategory: ''
      });
      setQuillContent('');
      setWordFile(null);
      setExistingWordFile(null);
      if (wordFileInputRef.current) {
        wordFileInputRef.current.value = '';
      }
    } catch (error) {
      console.error("Error saving template:", error);
      // You might want to show an error message to the user here
    }
  };

  const deleteWordTemplate = async () => {
    if (editingId && existingWordFile) {
      try {
        const fileRef = ref(storage, existingWordFile);
        await deleteObject(fileRef);
        await updateDoc(doc(db, 'templates', editingId), { wordTemplateUrl: null });
        setExistingWordFile(null);
      } catch (error) {
        console.error("Error deleting Word template:", error);
        // You might want to show an error message to the user here
      }
    }
  };

  const editTemplate = (template: Template) => {
    setEditingId(template.id)
    reset(template)
    setQuillContent(template.content)
    setExistingWordFile(template.wordTemplateUrl || null);
  }

  const deleteTemplate = (id: string) => {
    setTemplateToDelete(id);
  };

  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (templateToDelete) {
      try {
        await deleteDoc(doc(db, 'templates', templateToDelete));
        setTemplateToDelete(null);
      } catch (error) {
        console.error("Error deleting template:", error);
        // Optionally, you can set an error state and display it to the user
      }
    }
  };

  // const getFieldDescription = (field: string): string => {
  //   switch (field) {
  //     case 'numberOfInterviews':
  //       return 'Total number of interviews for this candidate';
  //   default:
  //     return '';
  //   }
  // }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Templates</h1>
      <div className="flex gap-6">
        <div className="w-full">
          <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-6 rounded-lg shadow-md">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Controller
                  name="name"
                  control={control}
                  defaultValue=""
                  render={({ field }) => <input {...field} placeholder="Template Name" className="input w-full" />}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Controller
                    name="type"
                    control={control}
                    defaultValue="adviser_email"
                    render={({ field }) => (
                      <select {...field} className="input w-full">
                        <option value="adviser_email">Adviser Email</option>
                        <option value="candidate_letter">Candidate Letter</option>
                        <option value="panel_document">Panel Document</option>
                      </select>
                    )}
                  />
                </div>
                <div>
                  <Controller
                    name="category"
                    control={control}
                    defaultValue=""
                    render={({ field }) => (
                      <select {...field} className="input w-full">
                        <option value="">Select Question Category</option>
                        {questionCategories.map((category) => (
                          <option key={category.id} value={category.category}>{category.category}</option>
                        ))}
                      </select>
                    )}
                  />
                </div>
                <div>
                  <Controller
                    name="generalCategory"
                    control={control}
                    defaultValue="Selection Qualities"
                    render={({ field }) => (
                      <select {...field} className="input w-full">
                        <option value="">Select General Category</option>
                        <option value="Selection Qualities">Selection Qualities</option>
                        <option value="Selection Criteria">Selection Criteria</option>
                        <option value="Formation Qualities">Formation Qualities</option>
                        <option value="Formation Criteria">Formation Criteria</option>
                        <option value="Answer the Question">Answer the Question</option>

                      </select>
                    )}
                  />
                </div>
              </div>
              <div className="h-[595px]"> {/* Fixed height container */}
                {watch('type') !== 'candidate_letter' ? (
                  <Controller
                    name="content"
                    control={control}
                    defaultValue=""
                    render={({ field }) => (
                      <textarea 
                        {...field}
                        placeholder="Template Content" 
                        className="input w-full h-full" 
                      />
                    )}
                  />
                ) : (
                  <ReactQuill
                    ref={quillRef}
                    value={quillContent}
                    onChange={setQuillContent}
                    className="h-full"
                    modules={{
                      toolbar: [
                        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                        ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'indent': '-1'}, { 'indent': '+1' }],
                        [{ 'align': [] }],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'font': [] }],
                        [{ 'size': ['small', false, 'large', 'huge'] }],
                        ['link', 'image', 'video'],
                        ['clean'],
                        ['code-block']
                      ],
                    }}
                    formats={[
                      'header',
                      'bold', 'italic', 'underline', 'strike', 'blockquote',
                      'list', 'bullet', 'indent',
                      'link', 'image', 'video',
                      'align',
                      'color', 'background',
                      'font', 'size',
                      'code-block'
                    ]}
                  />
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-4 mt-14">
              <button type="submit" className="btn-primary">
                {editingId ? 'Update Template' : 'Add Template'}
              </button>
              
              {watch('type') === 'candidate_letter' && (
                <div className="flex-grow">
                  {existingWordFile ? (
                    <div className="flex items-center space-x-2">
                      <a 
                        href={existingWordFile} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-600 hover:text-blue-900 flex items-center"
                      >
                        <Upload className="h-5 w-5 mr-1" />
                        Backup Word Template
                      </a>
                      <button 
                        type="button" 
                        onClick={deleteWordTemplate}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <label htmlFor="wordTemplate" className="sr-only">Upload Word Template</label>
                      <input
                        id="wordTemplate"
                        type="file"
                        accept=".docx"
                        onChange={(e) => setWordFile(e.target.files?.[0] || null)}
                        ref={wordFileInputRef}
                        className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100"
                      />
                    </>
                  )}
                  <p className="text-yellow-600 text-sm mt-2">
                    Note: Word file is not used in the HTML editor
                  </p>
                </div>
              )}
            </div>
          </form>
        </div>
        
        <div className="w-1/8">
          <div className="bg-white p-4 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-2">Available Fields</h2>
            <div className="mb-2">
              <h3 className="font-medium mb-1 text-sm">Candidate Fields</h3>
              <ul className="space-y-0.5 text-sm">
                {candidateFields.map(field => (
                  <li 
                    key={field} 
                    className="cursor-pointer text-blue-600 hover:underline"
                    onClick={() => insertPlaceholder(field)}
                  >
                    {field}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mb-2">
              <h3 className="font-medium mb-1 text-sm">Interview Fields</h3>
              <ul className="space-y-0.5 text-sm">
                {interviewFields.map(field => (
                  <li 
                    key={field} 
                    className="cursor-pointer text-blue-600 hover:underline"
                    onClick={() => insertPlaceholder(field)}
                  >
                    {field}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-1 text-sm">NDA Fields</h3>
              <ul className="space-y-0.5 text-sm">
                {ndaFields.map(field => (
                  <li 
                    key={field} 
                    className="cursor-pointer text-blue-600 hover:underline"
                    onClick={() => insertPlaceholder(`nda.${field}`)}
                  >
                    nda.{field}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-md overflow-hidden mt-8">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">General Category</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Word Template</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedTemplates.map((template) => (
              <tr key={template.id} className="hover:bg-gray-50">
                <td className="px-4 py-1 whitespace-nowrap">{template.category}</td>
                <td className="px-4 py-1 whitespace-nowrap capitalize">{template.type}</td>
                <td className="px-4 py-1 whitespace-nowrap">{template.name}</td>
                <td className="px-4 py-1 whitespace-nowrap">{template.generalCategory}</td>
                <td className="px-4 py-1 whitespace-nowrap">
                  {template.wordTemplateUrl && (
                    <a href={template.wordTemplateUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-900">
                      <Download className="h-4 w-4 inline-block mr-1" />
                      Download
                    </a>
                  )}
                </td>
                <td className="px-4 py-1 whitespace-nowrap">
                  <button onClick={() => editTemplate(template)} className="text-blue-600 hover:text-blue-900 mr-2">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => deleteTemplate(template.id)} className="text-red-600 hover:text-red-900">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {templateToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Delete Template</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this template? This action cannot be undone.
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
                  onClick={() => setTemplateToDelete(null)}
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

export default Templates