export type RootStackParamList = {
  Login: undefined;
  OfficerNotice: undefined;
  Tabs: undefined;
  SchemeDetails: { schemeId: string };
  Eligibility: { schemeId: string };
  ApplicationOverview: { applicationId: string };
  ApplicationForm: { applicationId: string };
  DocumentChecklist: { applicationId: string };
  DocumentUpload: { applicationId: string; docType: string; documentName: string };
  DocumentVerification: { documentId: string };
  DocumentReplace: { documentId: string; docType: string; documentName: string };
  ApplicationStatus: { applicationId: string };
};

export type TabParamList = {
  Home: undefined;
  Scholarships: undefined;
  Applications: undefined;
  Notifications: undefined;
  Profile: undefined;
};
