import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType,
  HeadingLevel,
  TableBorders,
  TableCellBorders,
  PageOrientation,
} from "docx";
import { saveAs } from "file-saver";

interface Candidate {
  id: string;
  forename: string;
  surname: string;
  ndaId: string;
  revisedQuestion: string;
  questionCategory: string;
  panelDateId: string;
  outcome?: "Agreed" | "Not Agreed"; // New field
  diocese: string; // Add this line if it's not already there

  // Add other fields as needed
}

interface Interview {
  id: string;
  candidateId: string;
  adviserNames: string[];
}

interface Report {
  id: string;
  candidateId: string;
  adviserId: string;
  attributes: {
    [key: string]: { id: string; name: string; value: number | string };
  };
  responseToQuestion?: "Yes" | "No" | "";
}

interface Adviser {
  id: string;
  name: string;
  title?: string;
}

interface QuestionCategory {
  id: string;
  category: string;
  generalCategory?: string;
  attributes: { id: string; name: string }[];
}

const PanelDateReport: React.FC = () => {
  const { panelDateId } = useParams<{ panelDateId: string }>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [ndas, setNDAs] = useState<{ [key: string]: string }>({});
  const [advisers, setAdvisers] = useState<{ [key: string]: Adviser }>({});
  const [questionCategories, setQuestionCategories] = useState<{
    [key: string]: QuestionCategory;
  }>({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [sortedCandidates, setSortedCandidates] = useState<Candidate[]>([]);
  const [ndaInfo, setNdaInfo] = useState<{ [key: string]: { name: string, title: string } }>({});

  const getQuestionCategoryOrder = (): { [key: string]: number } => {
    const order = Object.values(questionCategories)
      .sort((a, b) => a.category.localeCompare(b.category))
      .reduce((acc, qc, index) => {
        acc[qc.category] = index;
        return acc;
      }, {} as { [key: string]: number });

    console.log("Question Category Order:", order);
    return order;
  };

  useEffect(() => {
    const fetchData = async () => {
      // Fetch candidates for this panel date
      const candidatesQuery = query(
        collection(db, "candidates"),
        where("panelDateId", "==", panelDateId)
      );
      const candidatesSnapshot = await getDocs(candidatesQuery);
      const candidatesData = candidatesSnapshot.docs.map(
        (doc) => ({ 
          id: doc.id, 
          ...doc.data(),
          diocese: doc.data().diocese || "[Diocese]" // Provide a fallback if needed
        } as Candidate)
      );
      setCandidates(candidatesData);

      // Fetch interviews for these candidates
      const interviewsQuery = query(
        collection(db, "interviews"),
        where("panelDateId", "==", panelDateId)
      );
      const interviewsSnapshot = await getDocs(interviewsQuery);
      const interviewsData = interviewsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Interview)
      );
      setInterviews(interviewsData);

      // Fetch reports for these candidates
      const reportsQuery = query(
        collection(db, "reports"),
        where("panelDateId", "==", panelDateId)
      );
      const reportsSnapshot = await getDocs(reportsQuery);
      const reportsData = reportsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Report)
      );
      setReports(reportsData);

      // Fetch Advisers
      const advisersSnapshot = await getDocs(collection(db, "advisers"));
      const advisersData = advisersSnapshot.docs.reduce((acc, doc) => {
        acc[doc.id] = {
          id: doc.id,
          name: doc.data().name,
          title: doc.data().title || 'No Title',
        };
        return acc;
      }, {} as { [key: string]: Adviser });
      console.log("Fetched advisers data:", advisersData); // Add this line for debugging
      setAdvisers(advisersData);

      // Fetch Question Categories
      const questionCategoriesSnapshot = await getDocs(
        collection(db, "questionCategories")
      );
      const questionCategoriesData = questionCategoriesSnapshot.docs.reduce(
        (acc, doc) => {
          acc[doc.id] = {
            id: doc.id,
            category: doc.data().category || doc.data().name,
            generalCategory: doc.data().generalCategory,
            attributes: doc.data().attributes || [],
          };
          return acc;
        },
        {} as { [key: string]: QuestionCategory }
      );
      setQuestionCategories(questionCategoriesData);

      // Fetch NDA info (name and title)
      const ndasSnapshot = await getDocs(collection(db, "ndas"));
      const ndasData = ndasSnapshot.docs.reduce((acc, doc) => {
        acc[doc.id] = {
          name: doc.data().name,
          title: doc.data().title || 'No Title', // Fallback if title is not set
        };
        return acc;
      }, {} as { [key: string]: { name: string, title: string } });
      setNdaInfo(ndasData);

      setDataLoaded(true);
    };

    fetchData();
  }, [panelDateId]);

  useEffect(() => {
    if (dataLoaded) {
      const questionCategoryOrder = getQuestionCategoryOrder();
      console.log("Final Question Category Order:", questionCategoryOrder);

      const sorted = [...candidates].sort((a, b) => {
        console.log(
          "Candidate A:",
          a.forename,
          a.surname,
          "Question Category:",
          a.questionCategory
        );
        console.log(
          "Candidate B:",
          b.forename,
          b.surname,
          "Question Category:",
          b.questionCategory
        );

        const orderA =
          questionCategoryOrder[a.questionCategory] ?? Number.MAX_SAFE_INTEGER;
        const orderB =
          questionCategoryOrder[b.questionCategory] ?? Number.MAX_SAFE_INTEGER;

        console.log("Order A:", orderA);
        console.log("Order B:", orderB);

        return orderA - orderB;
      });

      console.log(
        "Sorted Candidates:",
        sorted.map((c) => `${c.forename} ${c.surname} (${c.questionCategory})`)
      );
      setSortedCandidates(sorted);
    }
  }, [dataLoaded, candidates, questionCategories]);

  const updateCandidateOutcome = async (
    candidateId: string,
    outcome: "Agreed" | "Not Agreed"
  ) => {
    try {
      const candidateRef = doc(db, "candidates", candidateId);
      await updateDoc(candidateRef, { outcome });

      // Update local state
      setCandidates((prevCandidates) =>
        prevCandidates.map((c) =>
          c.id === candidateId ? { ...c, outcome } : c
        )
      );
    } catch (error) {
      console.error("Error updating candidate outcome:", error);
    }
  };

  const exportToHTML = () => {
    let htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Panel Date Report</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.3; /* Reduced from 1.6 */
            color: #333; 
            font-size: 10.5px;
          }
          h1 { 
            color: #2c3e50; 
            font-size: 18px; 
            margin-bottom: 10px; /* Add some space below the main title */
          }
          h2 { 
            color: #34495e; 
            font-size: 14px;
            margin-top: 15px; /* Add some space above each candidate's name */
            margin-bottom: 5px; /* Reduce space below the candidate's name */
          }
          h3 { 
            font-size: 12px;
            margin-top: 10px;
            margin-bottom: 5px;
          }
          p {
            margin: 3px 0; /* Reduce vertical margins between paragraphs */
          }
          table { 
            border-collapse: collapse; 
            width: 100%; 
            font-size: 10.5px;
            margin-top: 5px; /* Add a little space above tables */
          }
          th, td { 
            border: 1px solid #ddd; 
            padding: 4px; /* Further reduced padding */
            text-align: left; 
          }
          th { 
            background-color: #f2f2f2; 
          }
        </style>
      </head>
      <body>
        <h1>Panel Date Report</h1>
    `;

    sortedCandidates.forEach((candidate) => {
      const candidateReports = reports.filter(
        (r) => r.candidateId === candidate.id
      );
      const uniqueQuestionCategories = [
        ...new Set(candidateReports.map((r) => r.questionCategory)),
      ];

      const nda = ndaInfo[candidate.ndaId];
      const ndaName = nda ? nda.name : "Not assigned";

      htmlContent += `
        <h2>${candidate.forename} ${candidate.surname}</h2>
        <p><strong>Assigned NDA:</strong> ${ndaName}</p>
        <p><strong>Interviews:</strong> ${
          interviews.filter((i) => i.candidateId === candidate.id).length
        }</p>
        <p><strong>Advisers:</strong> ${interviews
          .find((i) => i.candidateId === candidate.id)
          ?.adviserNames.join(", ")}</p>
        <p><strong>Revised Question:</strong> ${candidate.revisedQuestion}</p>
      `;

      uniqueQuestionCategories.forEach((qcId) => {
        const questionCategoryData = questionCategories[qcId];
        htmlContent += `<p><strong>Question Category:</strong> ${
          questionCategoryData?.category || "Unknown"
        }</p>`;
      });

      if (candidateReports.some((report) => report.responseToQuestion)) {
        htmlContent += "<h3>Response to Question:</h3>";
        candidateReports
          .filter((report) => report.responseToQuestion)
          .forEach((report) => {
            htmlContent += `<p>${report.responseToQuestion || ""}</p>`;
          });
      }

      const hasAttributeValues = candidateReports.some((report) =>
        Object.values(report.attributes).some(
          (attr) =>
            attr.value !== "" && attr.value !== null && attr.value !== undefined
        )
      );

      if (hasAttributeValues) {
        const columnHeader = questionCategories[candidateReports[0]?.questionCategory]?.generalCategory || "Attribute";

        htmlContent += `
          <h3>Reporting Bandings</h3>
          <table>
            <tr>
              <th>${columnHeader}</th>
              <th>Banding</th>
              <th>Adviser</th>
            </tr>
        `;
        candidateReports.forEach((report) => {
          Object.entries(report.attributes)
            .filter(
              ([_, attr]) =>
                attr.value !== "" &&
                attr.value !== null &&
                attr.value !== undefined
            )
            .forEach(([key, attr]) => {
              const adviser = Object.values(advisers).find(a => a.id === report.adviserId);
              const adviserName = adviser ? adviser.name : "Unknown";
              htmlContent += `
                <tr>
                  <td>${attr.name}</td>
                  <td>${attr.value}</td>
                  <td>${adviserName}</td>
                </tr>
              `;
            });
        });
        htmlContent += "</table>";
      }
    });

    htmlContent += `
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "panel_date_report.html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToWord = async () => {
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Arial",
              size: 21,
              color: "333333",
            },
            paragraph: {
              spacing: { line: 260 },
            },
          },
        },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 42,
              bold: true,
              color: "2C3E50",
            },
            paragraph: {
              spacing: { after: 200 },
            },
          },
          {
            id: "Heading2",
            name: "Heading 2",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 34,
              bold: true,
              color: "34495E",
            },
            paragraph: {
              spacing: { before: 300, after: 100 },
            },
          },
          {
            id: "Heading3",
            name: "Heading 3",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 24,
              bold: true,
            },
            paragraph: {
              spacing: { before: 200, after: 100 },
            },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 720, // 0.5 inch
                right: 720, // 0.5 inch
                bottom: 720, // 0.5 inch
                left: 720, // 0.5 inch
              },
              orientation: PageOrientation.PORTRAIT,
            },
          },
          children: [
            new Paragraph({
              text: "Panel Date Report",
              heading: HeadingLevel.HEADING_2,
            }),
            ...sortedCandidates.flatMap((candidate) => {
              const candidateReports = reports.filter(
                (r) => r.candidateId === candidate.id
              );
              const uniqueQuestionCategories = [
                ...new Set(candidateReports.map((r) => r.questionCategory)),
              ];

              const nda = ndaInfo[candidate.ndaId];
              const ndaName = nda ? nda.name : "Not assigned";

              const sections = [
                new Paragraph({
                  text: `${candidate.forename} ${candidate.surname}`,
                  heading: HeadingLevel.HEADING_3,
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Assigned NDA: ", bold: true }),
                    new TextRun(ndaName),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Interviews: ", bold: true }),
                    new TextRun(
                      interviews
                        .filter((i) => i.candidateId === candidate.id)
                        .length.toString()
                    ),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Advisers: ", bold: true }),
                    new TextRun(
                      interviews
                        .find((i) => i.candidateId === candidate.id)
                        ?.adviserNames.join(", ") || ""
                    ),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Revised Question: ", bold: true }),
                    new TextRun(candidate.revisedQuestion),
                  ],
                }),
                ...uniqueQuestionCategories.map(
                  (qcId) =>
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Question Category: ",
                          bold: true,
                        }),
                        new TextRun(
                          questionCategories[qcId]?.category || "Unknown"
                        ),
                      ],
                    })
                ),
              ];

              if (
                candidateReports.some((report) => report.responseToQuestion)
              ) {
                sections.push(
                  new Paragraph({
                    text: "Response to Question:",
                    heading: HeadingLevel.HEADING_3,
                  }),
                  ...candidateReports
                    .filter((report) => report.responseToQuestion)
                    .map(
                      (report) => new Paragraph(report.responseToQuestion || "")
                    )
                );
              }

              const hasAttributeValues = candidateReports.some((report) =>
                Object.values(report.attributes).some(
                  (attr) =>
                    attr.value !== "" &&
                    attr.value !== null &&
                    attr.value !== undefined
                )
              );

              if (hasAttributeValues) {
                const columnHeader = questionCategories[candidateReports[0]?.questionCategory]?.generalCategory || "Attribute";

                sections.push(
                  new Paragraph({
                    text: "Reporting Bandings",
                    heading: HeadingLevel.HEADING_3,
                  }),
                  new Table({
                    width: {
                      size: 100,
                      type: WidthType.PERCENTAGE,
                    },
                    rows: [
                      new TableRow({
                        tableHeader: true,
                        children: [
                          new TableCell({
                            children: [new Paragraph(columnHeader)],
                            shading: { fill: "F2F2F2" },
                          }),
                          new TableCell({
                            children: [new Paragraph("Banding")],
                            shading: { fill: "F2F2F2" },
                          }),
                          new TableCell({
                            children: [new Paragraph("Adviser")],
                            shading: { fill: "F2F2F2" },
                          }),
                        ],
                      }),
                      ...candidateReports.flatMap((report) =>
                        Object.entries(report.attributes)
                          .filter(
                            ([_, attr]) =>
                              attr.value !== "" &&
                              attr.value !== null &&
                              attr.value !== undefined
                          )
                          .map(([key, attr]) => {
                            const adviser = Object.values(advisers).find(a => a.id === report.adviserId);
                            const adviserName = adviser ? adviser.name : "Unknown";
                            return new TableRow({
                              children: [
                                new TableCell({
                                  children: [new Paragraph(attr.name)],
                                }),
                                new TableCell({
                                  children: [
                                    new Paragraph(attr.value.toString()),
                                  ],
                                }),
                                new TableCell({
                                  children: [new Paragraph(adviserName)],
                                }),
                              ],
                            });
                          })
                      ),
                    ],
                  })
                );
              }

              return sections;
            }),
          ],
        },
      ],
    });

    Packer.toBlob(doc).then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "panel_date_report.docx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    });
  };

  const generateMinutes = async () => {
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Arial",
              size: 21,
              color: "333333",
            },
            paragraph: {
              spacing: { line: 260 },
            },
          },
        },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 42,
              bold: true,
              color: "2C3E50",
            },
            paragraph: {
              spacing: { after: 200 },
            },
          },
          {
            id: "Heading2",
            name: "Heading 2",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 34,
              bold: true,
              color: "34495E",
            },
            paragraph: {
              spacing: { before: 300, after: 100 },
            },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 720,
                right: 720,
                bottom: 720,
                left: 720,
              },
              orientation: PageOrientation.PORTRAIT,
            },
          },
          children: [
            new Paragraph({
              text: "Cases",
              heading: HeadingLevel.HEADING_3,
            }),
            ...sortedCandidates.flatMap((candidate, index) => {
              const candidateInterviews = interviews.filter(i => i.candidateId === candidate.id);
              const nda = ndaInfo[candidate.ndaId];
              
              // Create initials from NDA name
              const ndaInitials = nda 
                ? nda.name.split(' ').map(n => n[0].toUpperCase()).join('')
                : 'N/A';

              // Format interview information
              let interviewText = "";
              if (candidateInterviews.length === 0) {
                interviewText = "was not interviewed";
              } else {
                const interviewCountText = candidateInterviews.length === 1 
                  ? "had one interview" 
                  : `had ${candidateInterviews.length} interviews`;

                if (candidateInterviews.length === 1) {
                  const interview = candidateInterviews[0];
                  const formattedAdviserNames = interview.adviserNames.map(adviserName => {
                    const adviser = Object.values(advisers).find(a => a.name === adviserName);
                    return adviser 
                      ? `${adviser.title ? `${adviser.title} ` : ''}${adviser.name}` 
                      : adviserName;
                  });
                  
                  if (formattedAdviserNames.length === 1) {
                    interviewText = `${interviewCountText} and was interviewed by ${formattedAdviserNames[0]}`;
                  } else {
                    const lastAdviser = formattedAdviserNames.pop();
                    interviewText = `${interviewCountText} and was interviewed by ${formattedAdviserNames.join(', ')} and ${lastAdviser}`;
                  }
                } else {
                  const interviewDetails = candidateInterviews.map((interview, index) => {
                    const formattedAdviserNames = interview.adviserNames.map(adviserName => {
                      const adviser = Object.values(advisers).find(a => a.name === adviserName);
                      return adviser 
                        ? `${adviser.title ? `${adviser.title} ` : ''}${adviser.name}` 
                        : adviserName;
                    });
                    
                    if (formattedAdviserNames.length === 1) {
                      return `was interviewed by ${formattedAdviserNames[0]}`;
                    } else {
                      const lastAdviser = formattedAdviserNames.pop();
                      return `was interviewed by ${formattedAdviserNames.join(', ')} and ${lastAdviser}`;
                    }
                  });
                  interviewText = `${interviewCountText}. ${candidate.forename} ${interviewDetails.join(', and ')}`;
                }
              }

              return [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${candidate.forename} ${candidate.surname} (${ndaInitials})`,
                      bold: true,
                      size: 24,
                    }),
                  ],
                  style: "Normal",
                }),
                new Paragraph({
                  children: [
                    new TextRun("The Candidates Panel was asked by the Diocese of "),
                    new TextRun({ text: candidate.diocese || "[Diocese]", bold: false }),
                    new TextRun(" "),
                    new TextRun({ text: candidate.revisedQuestion || "[revised question]", bold: false }),
                    new TextRun(". Prior to the meeting "),
                    new TextRun({ text: candidate.forename, bold: false }),
                    new TextRun(` ${interviewText}`),
                    new TextRun(". In the light of their reports and papers received from the Diocese, and after careful discussion, the Panel "),
                    new TextRun({ text: candidate.outcome === "Agreed" ? "was glad to agree to" : "did not agree to", bold: true }),
                    new TextRun(" the request."),
                  ],
                }),
                // Add a space after each candidate except the last one
                ...(index < sortedCandidates.length - 1 ? [
                  new Paragraph({
                    children: [new TextRun("")],
                    spacing: {
                      after: 400, // This adds space after the paragraph. Adjust the value as needed.
                    },
                  }),
                ] : []),
              ];
            }),
          ],
        },
      ],
    });

    Packer.toBlob(doc).then((blob) => {
      saveAs(blob, "panel_date_minutes.docx");
    });
  };

  const deleteInterview = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'interviews', id));
      setInterviews(prevInterviews => prevInterviews.filter(interview => interview.id !== id));
      setInterviewToDelete(null);
    } catch (err) {
      setError('An error occurred while deleting the interview');
      console.error(err);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Panel Date Report</h1>
        <div className="flex space-x-2">
          <button
            onClick={exportToHTML}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center"
          >
            <i className="fas fa-file-code mr-2"></i>
            Export to HTML
          </button>
          <button
            onClick={exportToWord}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center"
          >
            <i className="fas fa-file-word mr-2"></i>
            Export to Word
          </button>
          <button
            onClick={generateMinutes}
            className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded flex items-center"
          >
            <i className="fas fa-file-alt mr-2"></i>
            Generate Minutes
          </button>
        </div>
      </div>
      {dataLoaded ? (
        sortedCandidates.map((candidate) => {
          const candidateReports = reports.filter(
            (r) => r.candidateId === candidate.id
          );
          const uniqueQuestionCategories = [
            ...new Set(candidateReports.map((r) => r.questionCategory)),
          ];

          const hasAttributeValues = candidateReports.some((report) =>
            Object.values(report.attributes).some(
              (attr) =>
                attr.value !== "" &&
                attr.value !== null &&
                attr.value !== undefined
            )
          );

          const candidateInterviews = interviews.filter((i) => i.candidateId === candidate.id);

          return (
            <div
              key={candidate.id}
              className="mb-8 bg-white p-4 rounded shadow"
            >
              <h2 className="text-xl font-semibold mb-2">
                {candidate.forename} {candidate.surname}
              </h2>
              <p>
                <strong>Assigned NDA:</strong>{" "}
                {ndaInfo[candidate.ndaId] 
                  ? ndaInfo[candidate.ndaId].name 
                  : "Not assigned"}
              </p>
              <p>
                <strong>Interviews:</strong>{" "}
                {
                  interviews.filter((i) => i.candidateId === candidate.id)
                    .length
                }
              </p>
              <p>
                <strong>Advisers:</strong>{" "}
                {candidateInterviews.map((interview, index) => (
                  <span key={interview.id}>
                    {interview.adviserNames.map(adviserName => {
                      const adviser = Object.values(advisers).find(a => a.name === adviserName);
                      return adviser ? adviser.name : adviserName;
                    }).join(", ")}
                    {index < candidateInterviews.length - 1 ? "; " : ""}
                  </span>
                ))}
              </p>
              <p>
                <strong>Revised Question:</strong> {candidate.revisedQuestion}
              </p>
              <p>
                <strong>Question Category:</strong> {candidate.questionCategory}
              </p>

              <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2">Panel Outcome</h3>
                <div className="flex space-x-4">
                  <button
                    onClick={() =>
                      updateCandidateOutcome(candidate.id, "Agreed")
                    }
                    className={`px-4 py-2 rounded ${
                      candidate.outcome === "Agreed"
                        ? "bg-green-500 text-white"
                        : "bg-gray-200"
                    }`}
                  >
                    Agreed
                  </button>
                  <button
                    onClick={() =>
                      updateCandidateOutcome(candidate.id, "Not Agreed")
                    }
                    className={`px-4 py-2 rounded ${
                      candidate.outcome === "Not Agreed"
                        ? "bg-red-500 text-white"
                        : "bg-gray-200"
                    }`}
                  >
                    Not Agreed
                  </button>
                </div>
              </div>

              {candidateReports.some((report) => report.responseToQuestion) && (
                <div className="mt-4">
                  {candidateReports.map(
                    (report) =>
                      report.responseToQuestion && (
                        <p key={report.id} className="mb-2">
                          <strong>Response to Question:</strong>{" "}
                          {report.responseToQuestion}
                        </p>
                      )
                  )}
                </div>
              )}

              {hasAttributeValues && (
                <>
                  <h3 className="text-lg font-semibold mt-4 mb-2">
                    Reporting Bandings
                  </h3>
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2">
                          {questionCategories[
                            candidateReports[0]?.questionCategory
                          ]?.generalCategory || "Attribute"}
                        </th>
                        <th className="border border-gray-300 px-4 py-2">
                          Banding
                        </th>
                        <th className="border border-gray-300 px-4 py-2">
                          Adviser
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const questionCategory =
                          questionCategories[
                            candidateReports[0]?.questionCategory
                          ];
                        if (!questionCategory) return null;

                        const attributeOrder =
                          questionCategory.attributes.reduce(
                            (acc, attr, index) => {
                              acc[attr.id] = index;
                              return acc;
                            },
                            {} as { [key: string]: number }
                          );

                        return candidateReports.flatMap((report) =>
                          Object.entries(report.attributes)
                            .filter(
                              ([_, attr]) =>
                                attr.value !== "" &&
                                attr.value !== null &&
                                attr.value !== undefined
                            )
                            .sort(
                              ([keyA], [keyB]) =>
                                (attributeOrder[keyA] || 0) -
                                (attributeOrder[keyB] || 0)
                            )
                            .map(([key, attr]) => {
                              const adviserName =
                                advisers[report.adviserId]?.name || "Unknown";

                              return (
                                <tr key={`${report.id}-${key}`}>
                                  <td className="border border-gray-300 px-4 py-2">
                                    {attr.name}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-2">
                                    {attr.value}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-2">
                                    {adviserName}
                                  </td>
                                </tr>
                              );
                            })
                        );
                      })()}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          );
        })
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default PanelDateReport;