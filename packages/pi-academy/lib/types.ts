export type VerifyResult = boolean | { success: false; errorReason: string };

/** 채점/처방 로직이 디스크·설정을 검사할 때 쓰는 무손상 런타임 컨텍스트.
 *  ExtensionCommandContext 의 축약판 — 순수 함수로 테스트 가능하도록 최소 표면만 노출한다. */
export interface AcademyContext {
	/** 학습을 시작한(고정된) 작업 디렉터리. */
	cwd: string;
	/** 실습 저장소 경로 (`<cwd>/tutorial-clone`). */
	cloneDir: string;
	/** Pi 코어 참조 클론 경로 (`<cwd>/pi-reference`). */
	referenceDir: string;
	/** 프로젝트 폴더의 신뢰 여부 반환. */
	isProjectTrusted(): boolean;
	/** 셸 명령 실행 (git 로그/브랜치 조회 등). ExtensionAPI.exec 를 위임받는다. */
	exec(command: string, args: string[], options?: { cwd?: string }): Promise<{ stdout: string; stderr: string; code: number }>;
	/** 사용자가 입력한 명령어 인자값 (퀴즈 정답 등). */
	args: string;
}

export interface CourseStep {
	/** 1-based 단계 번호. 배열 인덱스+1 과 일치해야 한다. */
	level: number;
	/** 대주제(부) 표기 — 진척도 UI 그룹핑용. */
	phase: string;
	/** 단계 타이틀. */
	title: string;
	/** 한 줄 요약(핵심 개념 및 실용 가치). */
	description: string;

	/** 아직 시도하지 않은 학생에게 띄우는 실습 행동 수칙 (TUI confirm 팝업 본문). */
	missionGuide: string;

	/** 미션 클리어 시 TUI 로 띄우는 잠금 해제 축하/다음 단계 안내 팝업 본문. */
	unlockMessage: string;

	/** 튜터 챗 세션으로 보내는 Cooperative Link 백그라운드 이벤트 문자열.
	 *  예: "PI_ACADEMY_STATUS: LEVEL_1_COMPLETE". */
	statusEvent: string;

	/** 디스크 상태·설정·세션 로그를 검사하는 무손상 비동기 채점 엔진. */
	verify: (ctx: AcademyContext) => Promise<VerifyResult>;

	/** 불합격(오답) 시 원인(errorReason)에 따라 맞춤 처방하는 기술 교정 매뉴얼. */
	recoveryGuide: (errorReason?: string) => string;

	/** 통과 직후 실행할 부수효과(실습 저장소 스캐폴딩, 참조 클론 등). 선택적. */
	onComplete?: (ctx: AcademyContext) => Promise<void>;
}

/** 디스크에 영속되는 진척 상태. 재시작·세션 전환 후에도 이어서 학습할 수 있게 한다. */
export interface AcademyState {
	/** 현재 진행 중인 단계 (1..N). 모든 단계 완료 시 N+1. */
	currentLevel: number;
	/** 학습을 시작한 경로. 이후 다른 경로에서 기동 시 차단하는 락. */
	startCwd: string | null;
}
